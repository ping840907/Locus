#include <pebble.h>

// ---------------------------------------------------------------------------
// Map Face
//
// A watchface that shows a Geoapify monochrome map (black background, grey
// road network) of the user's surroundings as the background, with the time
// and date rendered on top in a clean, designed overlay.
//
// The map image (PNG) is fetched and rendered on the phone side (PebbleKit JS)
// and streamed to the watch in chunks over AppMessage. This file is
// responsible for:
//   * Receiving configuration (colors, toggles) from Clay.
//   * Receiving the streamed PNG, reassembling it and decoding it.
//   * Drawing the map + a designed time/date overlay.
//   * Asking the phone for a refresh once an hour (and on launch).
// ---------------------------------------------------------------------------

// Persistent storage keys
#define PERSIST_TIME_COLOR      100
#define PERSIST_DATE_COLOR      101
#define PERSIST_BG_COLOR        102
#define PERSIST_SHOW_DATE       103
#define PERSIST_SHOW_CENTER_DOT 104

// Defaults (dark theme to match the dark-matter map style)
#define DEFAULT_TIME_COLOR      0xFFFFFF // white
#define DEFAULT_DATE_COLOR      0xAAAAAA // light grey
#define DEFAULT_BG_COLOR        0x000000 // black
#define DEFAULT_SHOW_DATE       true
#define DEFAULT_SHOW_CENTER_DOT true

static Window *s_window;
static Layer *s_canvas_layer;     // draws bg + map + center dot
static Layer *s_overlay_layer;    // draws the time/date overlay

static GBitmap *s_map_bitmap = NULL;

// Incoming image stream buffer
static uint8_t *s_img_buffer = NULL;
static uint32_t s_img_size = 0;
static uint32_t s_img_received = 0;

// Config (kept in memory, mirrored in persistent storage)
static GColor s_time_color;
static GColor s_date_color;
static GColor s_bg_color;
static bool s_show_date = DEFAULT_SHOW_DATE;
static bool s_show_center_dot = DEFAULT_SHOW_CENTER_DOT;

// Cached time strings
static char s_time_buf[8];
static char s_date_buf[24];

// Transient status / debug line shown at the bottom of the face.
static char s_status[40] = "";

static void set_status(const char *text) {
  strncpy(s_status, text, sizeof(s_status) - 1);
  s_status[sizeof(s_status) - 1] = '\0';
  if (s_overlay_layer) {
    layer_mark_dirty(s_overlay_layer);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static void request_update(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) == APP_MSG_OK) {
    dict_write_uint8(iter, MESSAGE_KEY_REQUEST_UPDATE, 1);
    app_message_outbox_send();
  }
}

static void update_time_strings(void) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);

  if (clock_is_24h_style()) {
    strftime(s_time_buf, sizeof(s_time_buf), "%H:%M", t);
  } else {
    strftime(s_time_buf, sizeof(s_time_buf), "%I:%M", t);
    // Strip a leading zero for 12h style (e.g. "09:30" -> "9:30")
    if (s_time_buf[0] == '0') {
      memmove(s_time_buf, s_time_buf + 1, strlen(s_time_buf));
    }
  }

  strftime(s_date_buf, sizeof(s_date_buf), "%a %d %b", t);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);

  // Background fill (also acts as a fallback when no map is loaded yet).
  graphics_context_set_fill_color(ctx, s_bg_color);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  // Map background. The image is requested taller than the screen; we centre-
  // crop it to the screen via a sub-bitmap so the Geoapify attribution band
  // baked onto the bottom edge is excluded, while the location (image centre)
  // stays at the screen centre.
  if (s_map_bitmap) {
    GRect img = gbitmap_get_bounds(s_map_bitmap);
    int crop_x = (img.size.w - bounds.size.w) / 2;
    int crop_y = (img.size.h - bounds.size.h) / 2;
    if (crop_x < 0) { crop_x = 0; }
    if (crop_y < 0) { crop_y = 0; }
    int draw_w = img.size.w < bounds.size.w ? img.size.w : bounds.size.w;
    int draw_h = img.size.h < bounds.size.h ? img.size.h : bounds.size.h;

    GRect sub_rect = GRect(img.origin.x + crop_x, img.origin.y + crop_y,
                           draw_w, draw_h);
    GBitmap *cropped = gbitmap_create_as_sub_bitmap(s_map_bitmap, sub_rect);

    GRect dest = GRect(bounds.origin.x + (bounds.size.w - draw_w) / 2,
                       bounds.origin.y + (bounds.size.h - draw_h) / 2,
                       draw_w, draw_h);
    graphics_context_set_compositing_mode(ctx, GCompOpAssign);
    graphics_draw_bitmap_in_rect(ctx, cropped ? cropped : s_map_bitmap, dest);
    if (cropped) {
      gbitmap_destroy(cropped);
    }
  }

  // Center dot marking the user's location (the map is centered there).
  if (s_show_center_dot) {
    GPoint center = grect_center_point(&bounds);
    graphics_context_set_fill_color(ctx, GColorWhite);
    graphics_fill_circle(ctx, center, 4);
    graphics_context_set_fill_color(ctx, GColorRed);
    graphics_fill_circle(ctx, center, 3);
  }
}

// Draw text with a 1px drop shadow for legibility over any map content.
static void draw_text_with_shadow(GContext *ctx, const char *text, GFont font,
                                  GRect box, GColor color, GColor shadow,
                                  GTextAlignment align) {
  GRect shadow_box = box;
  shadow_box.origin.x += 1;
  shadow_box.origin.y += 1;
  graphics_context_set_text_color(ctx, shadow);
  graphics_draw_text(ctx, text, font, shadow_box,
                     GTextOverflowModeTrailingEllipsis, align, NULL);
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, text, font, box,
                     GTextOverflowModeTrailingEllipsis, align, NULL);
}

static void overlay_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GColor shadow = GColorBlack;

  GFont time_font = fonts_get_system_font(FONT_KEY_LECO_42_NUMBERS);
  GFont date_font = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);

  // Vertically center the time block.
  int time_h = 44;
  int date_h = 22;
  int block_h = s_show_date ? (time_h + 6 + date_h) : time_h;
  int top = bounds.origin.y + (bounds.size.h - block_h) / 2;

  // Time
  GRect time_box = GRect(bounds.origin.x, top, bounds.size.w, time_h);
  draw_text_with_shadow(ctx, s_time_buf, time_font, time_box,
                        s_time_color, shadow, GTextAlignmentCenter);

  if (s_show_date) {
    // A short accent divider between time and date for a designed look.
    int divider_w = 40;
    int divider_y = top + time_h + 2;
    GPoint dl = GPoint(bounds.origin.x + (bounds.size.w - divider_w) / 2, divider_y);
    GPoint dr = GPoint(dl.x + divider_w, divider_y);
    graphics_context_set_stroke_color(ctx, shadow);
    graphics_draw_line(ctx, GPoint(dl.x, dl.y + 1), GPoint(dr.x, dr.y + 1));
    graphics_context_set_stroke_color(ctx, s_date_color);
    graphics_draw_line(ctx, dl, dr);

    // Date
    GRect date_box = GRect(bounds.origin.x, divider_y + 4, bounds.size.w, date_h);
    draw_text_with_shadow(ctx, s_date_buf, date_font, date_box,
                          s_date_color, shadow, GTextAlignmentCenter);
  }

  // Status / debug line at the bottom (only when there is something to show).
  if (s_status[0] != '\0') {
    GFont status_font = fonts_get_system_font(FONT_KEY_GOTHIC_14);
    GRect status_box = GRect(bounds.origin.x + 4,
                             bounds.origin.y + bounds.size.h - 22,
                             bounds.size.w - 8, 18);
    draw_text_with_shadow(ctx, s_status, status_font, status_box,
                          GColorYellow, shadow, GTextAlignmentCenter);
  }
}

// ---------------------------------------------------------------------------
// Image stream handling
// ---------------------------------------------------------------------------

static void reset_image_stream(void) {
  if (s_img_buffer) {
    free(s_img_buffer);
    s_img_buffer = NULL;
  }
  s_img_size = 0;
  s_img_received = 0;
}

static void finalize_image(void) {
  if (!s_img_buffer) {
    set_status("No buffer");
    return;
  }

  // Capture the first bytes for an error message before the buffer is freed.
  uint8_t b0 = s_img_size > 0 ? s_img_buffer[0] : 0;
  uint8_t b1 = s_img_size > 1 ? s_img_buffer[1] : 0;
  uint8_t b2 = s_img_size > 2 ? s_img_buffer[2] : 0;
  uint8_t b3 = s_img_size > 3 ? s_img_buffer[3] : 0;
  uint32_t recv = s_img_received, total = s_img_size;
  static char dbg[40];

  if (recv < total) {
    snprintf(dbg, sizeof(dbg), "Short %u/%u",
             (unsigned int)recv, (unsigned int)total);
    set_status(dbg);
    reset_image_stream();
    return;
  }

  GBitmap *new_bitmap = gbitmap_create_from_png_data(s_img_buffer, s_img_size);
  // The PNG bytes are no longer needed once decoded (or if decode failed).
  reset_image_stream();

  if (new_bitmap && gbitmap_get_bounds(new_bitmap).size.w > 0) {
    if (s_map_bitmap) {
      gbitmap_destroy(s_map_bitmap);
    }
    s_map_bitmap = new_bitmap;
    layer_mark_dirty(s_canvas_layer);
    set_status(""); // success: clear status for a clean face
  } else {
    // Decode failed: surface the header bytes so we can tell why.
    if (new_bitmap) {
      gbitmap_destroy(new_bitmap);
    }
    snprintf(dbg, sizeof(dbg), "Decode fail %02x%02x%02x%02x", b0, b1, b2, b3);
    set_status(dbg);
  }
}

// ---------------------------------------------------------------------------
// Config handling
// ---------------------------------------------------------------------------

static void apply_config(DictionaryIterator *iter) {
  bool changed = false;

  Tuple *t;

  t = dict_find(iter, MESSAGE_KEY_TIME_COLOR);
  if (t) {
    s_time_color = GColorFromHEX(t->value->int32);
    persist_write_int(PERSIST_TIME_COLOR, t->value->int32);
    changed = true;
  }
  t = dict_find(iter, MESSAGE_KEY_DATE_COLOR);
  if (t) {
    s_date_color = GColorFromHEX(t->value->int32);
    persist_write_int(PERSIST_DATE_COLOR, t->value->int32);
    changed = true;
  }
  t = dict_find(iter, MESSAGE_KEY_BG_COLOR);
  if (t) {
    s_bg_color = GColorFromHEX(t->value->int32);
    persist_write_int(PERSIST_BG_COLOR, t->value->int32);
    changed = true;
  }
  t = dict_find(iter, MESSAGE_KEY_SHOW_DATE);
  if (t) {
    s_show_date = t->value->int32 != 0;
    persist_write_bool(PERSIST_SHOW_DATE, s_show_date);
    changed = true;
  }
  t = dict_find(iter, MESSAGE_KEY_SHOW_CENTER_DOT);
  if (t) {
    s_show_center_dot = t->value->int32 != 0;
    persist_write_bool(PERSIST_SHOW_CENTER_DOT, s_show_center_dot);
    changed = true;
  }

  if (changed) {
    layer_mark_dirty(s_canvas_layer);
    layer_mark_dirty(s_overlay_layer);
  }
}

static void load_persisted_config(void) {
  s_time_color = GColorFromHEX(persist_exists(PERSIST_TIME_COLOR)
      ? persist_read_int(PERSIST_TIME_COLOR) : DEFAULT_TIME_COLOR);
  s_date_color = GColorFromHEX(persist_exists(PERSIST_DATE_COLOR)
      ? persist_read_int(PERSIST_DATE_COLOR) : DEFAULT_DATE_COLOR);
  s_bg_color = GColorFromHEX(persist_exists(PERSIST_BG_COLOR)
      ? persist_read_int(PERSIST_BG_COLOR) : DEFAULT_BG_COLOR);
  s_show_date = persist_exists(PERSIST_SHOW_DATE)
      ? persist_read_bool(PERSIST_SHOW_DATE) : DEFAULT_SHOW_DATE;
  s_show_center_dot = persist_exists(PERSIST_SHOW_CENTER_DOT)
      ? persist_read_bool(PERSIST_SHOW_CENTER_DOT) : DEFAULT_SHOW_CENTER_DOT;
}

// ---------------------------------------------------------------------------
// AppMessage
// ---------------------------------------------------------------------------

static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  // Image stream control: start a new transfer.
  Tuple *size_t = dict_find(iter, MESSAGE_KEY_IMG_SIZE);
  if (size_t) {
    reset_image_stream();
    s_img_size = size_t->value->uint32;
    if (s_img_size > 0 && s_img_size < 256 * 1024) {
      s_img_buffer = malloc(s_img_size);
    }
    if (!s_img_buffer) {
      s_img_size = 0; // allocation failed; ignore the incoming stream
      set_status("Img buffer fail");
    } else {
      set_status("Loading map...");
    }
    return;
  }

  // Image stream control: a data chunk.
  Tuple *data_t = dict_find(iter, MESSAGE_KEY_IMG_DATA);
  Tuple *offset_t = dict_find(iter, MESSAGE_KEY_IMG_OFFSET);
  if (data_t && offset_t && s_img_buffer) {
    uint32_t offset = offset_t->value->uint32;
    uint16_t len = data_t->length;
    if (offset + len <= s_img_size) {
      memcpy(s_img_buffer + offset, data_t->value->data, len);
      s_img_received += len;
    }
    return;
  }

  // Image stream control: transfer complete.
  if (dict_find(iter, MESSAGE_KEY_IMG_COMPLETE)) {
    finalize_image();
    return;
  }

  // Status / debug line pushed from the phone.
  Tuple *status_t = dict_find(iter, MESSAGE_KEY_STATUS);
  if (status_t && status_t->length > 0) {
    set_status(status_t->value->cstring);
    return;
  }

  // Otherwise treat the message as a config update from Clay.
  apply_config(iter);
}

static void inbox_dropped_handler(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "Inbox dropped: %d", (int)reason);
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time_strings();
  layer_mark_dirty(s_overlay_layer);

  // Ask the phone for a location/map refresh once an hour (top of the hour).
  if (tick_time->tm_min == 0) {
    request_update();
  }
}

// ---------------------------------------------------------------------------
// Window lifecycle
// ---------------------------------------------------------------------------

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(root, s_canvas_layer);

  s_overlay_layer = layer_create(bounds);
  layer_set_update_proc(s_overlay_layer, overlay_update_proc);
  layer_add_child(root, s_overlay_layer);

  update_time_strings();
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas_layer);
  layer_destroy(s_overlay_layer);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

static void init(void) {
  load_persisted_config();

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  app_message_register_inbox_received(inbox_received_handler);
  app_message_register_inbox_dropped(inbox_dropped_handler);
  // Large inbox to fit ~1KB image chunks; small outbox for control messages.
  app_message_open(2048, 256);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
}

static void deinit(void) {
  tick_timer_service_unsubscribe();
  if (s_map_bitmap) {
    gbitmap_destroy(s_map_bitmap);
  }
  reset_image_stream();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}
