import {
  mysqlTable,
  int,
  varchar,
  text,
  mediumtext,
  timestamp,
  datetime,
  decimal,
  float,
  mysqlEnum,
  json,
  date,
  tinyint,
  bigint,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ── Core: Admin ──────────────────────────────────────────────

export const admin = mysqlTable("admin", {
  id: int("id").primaryKey().autoincrement(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  active: int("active").notNull().default(1),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: User ───────────────────────────────────────────────

export const user = mysqlTable("user", {
  id: int("id").primaryKey().autoincrement(),
  firstName: varchar("first_name", { length: 150 }).notNull(),
  lastName: varchar("last_name", { length: 150 }).notNull(),
  gender: varchar("gender", { length: 10 }).notNull(),
  bio: mediumtext("bio").notNull(),
  website: varchar("website", { length: 255 }).notNull(),
  dob: date("dob").notNull(),
  socialId: varchar("social_id", { length: 255 }).notNull(),
  email: varchar("email", { length: 150 }),
  phone: varchar("phone", { length: 255 }),
  password: varchar("password", { length: 500 }).notNull(),
  profilePic: varchar("profile_pic", { length: 255 }).notNull(),
  profilePicSmall: varchar("profile_pic_small", { length: 255 }).notNull(),
  profileGif: varchar("profile_gif", { length: 255 }).notNull(),
  profileVideo: varchar("profile_video", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["user", "svip", "svip2", "svip3", "host", "coin_seller", "sub_agency", "agency", "bd", "bd_head", "official"]).notNull().default("user"),
  username: varchar("username", { length: 255 }),
  social: varchar("social", { length: 255 }).notNull(),
  deviceToken: varchar("device_token", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  active: int("active").notNull().default(1),
  lat: varchar("lat", { length: 255 }).notNull(),
  long: varchar("long", { length: 255 }).notNull(),
  online: int("online").notNull(),
  verified: int("verified").notNull(),
  authToken: varchar("auth_token", { length: 255 }).notNull(),
  version: varchar("version", { length: 255 }).notNull(),
  device: varchar("device", { length: 255 }).notNull(),
  ip: varchar("ip", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  region: varchar("region", { length: 255 }).notNull(),
  locationString: varchar("location_string", { length: 255 }).notNull(),
  countryId: int("country_id").notNull(),
  wallet: int("wallet").notNull(),
  paypal: varchar("paypal", { length: 255 }).notNull(),
  private: int("private").notNull(),
  profileView: int("profile_view").notNull().default(1),
  resetWalletDatetime: datetime("reset_wallet_datetime", { fsp: 3 }).notNull(),
  referralCode: varchar("referral_code", { length: 255 }).notNull(),
  registerWith: varchar("register_with", { length: 255 }).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  parent: int("parent").notNull(),
  business: int("business").notNull(),
  professionId: int("profession_id"),
  level: int("level").default(1),
  totalFlems: bigint("total_flems", { mode: "number" }).default(0),
  formattedLevel: varchar("formatted_level", { length: 20 }).default("Beginner"),
});

// ── Core: Video ──────────────────────────────────────────────

export const video = mysqlTable("video", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  description: mediumtext("description").notNull(),
  video: varchar("video", { length: 500 }).notNull().default("NULL"),
  thum: varchar("thum", { length: 500 }).notNull().default("NULL"),
  thumSmall: int("thum_small").notNull(),
  gif: varchar("gif", { length: 500 }).notNull().default("NULL"),
  view: int("view").notNull().default(0),
  section: varchar("section", { length: 250 }).notNull().default("0"),
  soundId: int("sound_id").notNull().default(0),
  privacyType: varchar("privacy_type", { length: 155 }).notNull().default("public"),
  allowComments: varchar("allow_comments", { length: 155 }).notNull().default("true"),
  allowDuet: int("allow_duet").notNull().default(0),
  block: int("block").notNull().default(0),
  duetVideoId: int("duet_video_id").notNull(),
  oldVideoId: int("old_video_id").notNull(),
  duration: float("duration").notNull(),
  promote: int("promote").notNull(),
  pinCommentId: int("pin_comment_id").notNull(),
  pin: int("pin").notNull(),
  repostUserId: int("repost_user_id").notNull(),
  repostVideoId: int("repost_video_id").notNull(),
  qualityCheck: int("quality_check").notNull(),
  viral: int("viral").notNull(),
  story: int("story").notNull(),
  countryId: int("country_id").notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  region: varchar("region", { length: 255 }).notNull(),
  locationString: varchar("location_string", { length: 255 }).notNull(),
  share: int("share").notNull(),
  videoWithWatermark: varchar("video_with_watermark", { length: 255 }).notNull(),
  lat: varchar("lat", { length: 255 }).notNull(),
  long: varchar("long", { length: 255 }).notNull(),
  productId: int("product_id"),
  locationId: int("location_id").notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  userThumbnail: varchar("user_thumbnail", { length: 255 }),
  defaultThumbnail: varchar("default_thumbnail", { length: 255 }),
  compression: int("compression").notNull(),
  nudityFound: int("nudity_found").notNull(),
  error: int("error").notNull(),
  created: datetime("created", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── Core: Sound ──────────────────────────────────────────────

export const sound = mysqlTable("sound", {
  id: int("id").primaryKey().autoincrement(),
  audio: varchar("audio", { length: 255 }).notNull(),
  duration: varchar("duration", { length: 20 }).notNull(),
  name: varchar("name", { length: 250 }).notNull(),
  description: varchar("description", { length: 150 }).notNull(),
  thum: varchar("thum", { length: 500 }).notNull(),
  soundSectionId: int("sound_section_id").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 150 }).notNull(),
  publish: int("publish").notNull(),
  created: timestamp("created").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── Core: Sound Section ─────────────────────────────────────

export const soundSection = mysqlTable("sound_section", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
});

// ── Core: Sticker ────────────────────────────────────────────

export const sticker = mysqlTable("sticker", {
  id: int("id").primaryKey().autoincrement(),
  image: varchar("image", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: int("type").notNull(),
  usedCount: int("used_count").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Hashtag ────────────────────────────────────────────

export const hashtag = mysqlTable("hashtag", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
});

// ── Core: Hashtag Video (Join) ───────────────────────────────

export const hashtagVideo = mysqlTable("hashtag_video", {
  id: int("id").primaryKey().autoincrement(),
  hashtagId: int("hashtag_id").notNull(),
  videoId: int("video_id").notNull(),
});

// ── Core: Hashtag Favourite ───────────────────────────────────

export const hashtagFavourite = mysqlTable("hashtag_favourite", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  hashtagId: int("hashtag_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Category ───────────────────────────────────────────

export const category = mysqlTable("category", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 80 }).notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  parentId: int("parent_id").notNull(),
});

// ── Core: Product Category ───────────────────────────────────

export const productCategory = mysqlTable("product_category", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 80 }).notNull(),
  parentId: int("parent_id").notNull(),
});

// ── Core: Topic ──────────────────────────────────────────────

export const topic = mysqlTable("topic", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  view: int("view").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: App Slider ─────────────────────────────────────────

export const appSlider = mysqlTable("app_slider", {
  id: int("id").primaryKey().autoincrement(),
  image: varchar("image", { length: 255 }).notNull(),
  url: varchar("url", { length: 255 }).notNull(),
  ecommerce: int("ecommerce").notNull(),
});

// ── Core: Promotion ──────────────────────────────────────────

export const promotion = mysqlTable("promotion", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  websiteUrl: varchar("website_url", { length: 255 }).notNull(),
  startDatetime: datetime("start_datetime", { fsp: 3 }).notNull(),
  endDatetime: datetime("end_datetime", { fsp: 3 }).notNull(),
  coin: int("coin").notNull(),
  active: int("active").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  actionButton: varchar("action_button", { length: 255 }).notNull(),
  destinationTap: int("destination_tap").notNull(),
  followers: int("followers").notNull(),
  reach: int("reach").notNull(),
  totalReach: int("total_reach").notNull(),
  clicks: int("clicks").notNull(),
  audienceId: int("audience_id").notNull(),
  paymentCardId: int("payment_card_id").notNull(),
  coinsConsumed: int("coins_consumed").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Coupon ─────────────────────────────────────────────

export const coupon = mysqlTable("coupon", {
  id: int("id").primaryKey().autoincrement(),
  couponCode: varchar("coupon_code", { length: 255 }).notNull(),
  discount: int("discount").notNull(),
  expiryDate: date("expiry_date").notNull(),
  limitUsers: int("limit_users").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Coupon Used ────────────────────────────────────────

export const couponUsed = mysqlTable("coupon_used", {
  id: int("id").primaryKey().autoincrement(),
  orderId: int("order_id").notNull(),
  couponId: int("coupon_id").notNull(),
  userId: int("user_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Gift ────────────────────────────────────────────────

export const gift = mysqlTable("gift", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  coin: int("coin").notNull(),
  icon: varchar("icon", { length: 255 }).notNull(),
  position: varchar("position", { length: 255 }).notNull(),
  featured: int("featured").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Gift Send ──────────────────────────────────────────

export const giftSend = mysqlTable("gift_send", {
  id: int("id").primaryKey().autoincrement(),
  giftId: int("gift_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  coin: int("coin").notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  senderId: int("sender_id").notNull(),
  receiverId: int("receiver_id").notNull(),
  videoId: int("video_id").notNull(),
  liveStreamingId: int("live_streaming_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  totalCoins: int("total_coins").default(0),
});

// ── Core: Withdraw Request ───────────────────────────────────

export const withdrawRequest = mysqlTable("withdraw_request", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  amount: float("amount").notNull(),
  status: int("status").notNull(),
  updated: datetime("updated", { fsp: 3 }).notNull(),
  coin: int("coin").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Report ──────────────────────────────────────────────

export const reportVideo = mysqlTable("report_video", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  reportReasonTitle: varchar("report_reason_title", { length: 255 }).notNull(),
  reportReasonId: int("report_reason_id").notNull(),
  description: text("description").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const reportUser = mysqlTable("report_user", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  reportReasonTitle: varchar("report_reason_title", { length: 255 }).notNull(),
  reportUserId: int("report_user_id").notNull(),
  reportReasonId: int("report_reason_id").notNull(),
  description: text("description").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const reportReason = mysqlTable("report_reason", {
  id: int("id").primaryKey().autoincrement(),
  title: text("title").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const reportProduct = mysqlTable("report_product", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  reportReasonTitle: varchar("report_reason_title", { length: 255 }).notNull(),
  productId: int("product_id").notNull(),
  reportReasonId: int("report_reason_id").notNull(),
  description: text("description").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const reportRoom = mysqlTable("report_room", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  reportReasonTitle: varchar("report_reason_title", { length: 255 }).notNull(),
  roomId: int("room_id").notNull(),
  reportReasonId: int("report_reason_id").notNull(),
  description: text("description").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: Verification Request ────────────────────────────────

export const verificationRequest = mysqlTable("verification_request", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  attachment: varchar("attachment", { length: 255 }).notNull(),
  verified: int("verified").notNull(),
  updateTime: datetime("update_time", { fsp: 3 }).notNull(),
  created: varchar("created", { length: 255 }).notNull(),
});

// ── Core: Setting ────────────────────────────────────────────

export const setting = mysqlTable("setting", {
  id: int("id").primaryKey().autoincrement(),
  type: varchar("type", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Core: HTML Page ─────────────────────────────────────────

export const htmlPage = mysqlTable("html_page", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  text: text("text").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Product ──────────────────────────────────────

export const product = mysqlTable("product", {
  id: int("id").primaryKey().autoincrement(),
  categoryId: int("category_id").notNull(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }).notNull(),
  description: text("description").notNull(),
  size: int("size").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  salePrice: decimal("sale_price", { precision: 10, scale: 2 }).notNull(),
  promote: int("promote").notNull(),
  status: int("status").notNull(),
  view: int("view").notNull(),
  orderNo: varchar("order_no", { length: 255 }).notNull(),
  condition: varchar("condition", { length: 255 }).notNull(),
  deliveryMethod: int("delivery_method").notNull(),
  meetupLocationLat: varchar("meetup_location_lat", { length: 255 }).notNull(),
  meetupLocationLong: varchar("meetup_location_long", { length: 255 }).notNull(),
  meetupLocationString: varchar("meetup_location_string", { length: 255 }).notNull(),
  lat: varchar("lat", { length: 255 }).notNull(),
  long: varchar("long", { length: 255 }).notNull(),
  locationString: varchar("location_string", { length: 255 }).notNull(),
  firebaseImagePath: varchar("firebase_image_path", { length: 255 }).notNull(),
  updated: datetime("updated", { fsp: 3 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Product Image ────────────────────────────────

export const productImage = mysqlTable("product_image", {
  id: int("id").primaryKey().autoincrement(),
  productId: int("product_id").notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  thum: varchar("thum", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Product Favourite ────────────────────────────

export const productFavourite = mysqlTable("product_favourite", {
  id: int("id").primaryKey().autoincrement(),
  productId: int("product_id").notNull(),
  userId: int("user_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Product Rating ────────────────────────────────

export const productRating = mysqlTable("product_rating", {
  id: int("id").primaryKey().autoincrement(),
  star: int("star").notNull(),
  comment: varchar("comment", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  userId: int("user_id").notNull(),
  productId: int("product_id").notNull(),
  orderId: int("order_id").notNull(),
  languageId: int("language_id").notNull().default(1),
});

// ── E-Commerce: Delivery Address ──────────────────────────────

export const deliveryAddress = mysqlTable("delivery_address", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  lat: varchar("lat", { length: 255 }).notNull(),
  long: varchar("long", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  countryId: int("country_id").notNull(),
  zip: varchar("zip", { length: 255 }).notNull(),
  street: varchar("street", { length: 255 }).notNull(),
  apartment: varchar("apartment", { length: 255 }).notNull(),
  instructions: text("instructions").notNull(),
  default: int("default").notNull(),
  placeId: varchar("place_id", { length: 255 }).notNull(),
  locationString: varchar("location_string", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Order ──────────────────────────────────────────

export const order = mysqlTable("order", {
  id: int("id").primaryKey().autoincrement(),
  productId: int("product_id").notNull(),
  productTitle: varchar("product_title", { length: 255 }).notNull(),
  productDescription: text("product_description").notNull(),
  productPrice: float("product_price").notNull(),
  cardId: int("card_id").notNull(),
  userId: int("user_id").notNull(),
  deliveryAddressId: int("delivery_address_id").notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull(),
  note: text("note").notNull(),
  total: float("total").notNull(),
  status: int("status").notNull().default(0),
  device: varchar("device", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── E-Commerce: Order Product ──────────────────────────────────

export const orderProduct = mysqlTable("order_product", {
  id: int("id").primaryKey().autoincrement(),
  productId: int("product_id").notNull(),
  orderId: int("order_id").notNull(),
  productTitle: varchar("product_title", { length: 255 }).notNull(),
  productPrice: float("product_price").notNull(),
  productQuantity: float("product_quantity").notNull(),
  productImage: varchar("product_image", { length: 255 }).notNull(),
  productAttributeCombinationId: int("product_attritube_combination_id").notNull(),
});

// ── Social: Notification ─────────────────────────────────────

export const notification = mysqlTable("notification", {
  id: int("id").primaryKey().autoincrement(),
  senderId: int("sender_id").notNull(),
  receiverId: int("receiver_id").notNull(),
  string: varchar("string", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  videoId: int("video_id").notNull(),
  liveStreamingId: int("live_streaming_id").notNull(),
  roomId: int("room_id").notNull(),
  status: varchar("status", { length: 255 }).notNull(),
  read: int("read").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  orderId: int("order_id").notNull(),
});

// ── Social: Follower ──────────────────────────────────────────

export const follower = mysqlTable("follower", {
  id: int("id").primaryKey().autoincrement(),
  senderId: int("sender_id").notNull(),
  receiverId: int("receiver_id").notNull(),
  notification: int("notification").notNull().default(1),
  promotionId: int("promotion_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Video Like ──────────────────────────────────────

export const videoLike = mysqlTable("video_like", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  like: int("like").notNull().default(1),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Video Comment ────────────────────────────────────

export const videoComment = mysqlTable("video_comment", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  comment: mediumtext("comment").notNull(),
  parentId: int("parent_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  pin: int("pin").notNull(),
});

// ── Social: Video Comment Like ───────────────────────────────

export const videoCommentLike = mysqlTable("video_comment_like", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  commentId: int("comment_id").notNull(),
  like: int("like").notNull().default(1),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Video Favourite ──────────────────────────────────

export const videoFavourite = mysqlTable("video_favourite", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Video Product ─────────────────────────────────────

export const videoProduct = mysqlTable("video_product", {
  id: int("id").primaryKey().autoincrement(),
  videoId: int("video_id").notNull(),
  productId: int("product_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Video Watch ──────────────────────────────────────

export const videoWatch = mysqlTable("video_watch", {
  id: int("id").primaryKey().autoincrement(),
  deviceId: int("device_id").notNull(),
  videoId: int("video_id").notNull(),
  userId: int("user_id").notNull(),
  duration: int("duration").notNull(),
  promotionId: int("promotion_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Repost Video ──────────────────────────────────────

export const repostVideo = mysqlTable("repost_video", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Profile Visit ────────────────────────────────────

export const profileVisit = mysqlTable("profile_visit", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  visitorId: int("visitor_id").notNull(),
  read: int("read").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Block User ──────────────────────────────────────

export const blockUser = mysqlTable("block_user", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  blockUserId: int("block_user_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Social: Not Interested Video ──────────────────────────────

export const notInterestedVideo = mysqlTable("not_interested_video", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  videoId: int("video_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Monetization: Purchase Coin ──────────────────────────────

export const purchaseCoin = mysqlTable("purchase_coin", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  coin: int("coin").notNull(),
  price: float("price").notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull(),
  device: varchar("device", { length: 255 }).notNull(),
  cardId: int("card_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Monetization: Coin Worth ──────────────────────────────────

export const coinWorth = mysqlTable("coin_worth", {
  id: int("id").primaryKey().autoincrement(),
  price: float("price").notNull(),
});

// ── Monetization: Transaction ────────────────────────────────

export const transaction = mysqlTable("transaction", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  title: text("title").notNull(),
  transactionType: mysqlEnum("transaction_type", ["buy_coins", "send_gift", "receive_gift", "withdraw_request", "withdraw_complete", "video_promotion", "other_earnings"]).notNull(),
  transactionDirection: mysqlEnum("transaction_direction", ["debit", "credit"]).notNull(),
  amount: int("amount").notNull(),
  usdValue: decimal("usd_value", { precision: 10, scale: 2 }),
  receiverId: int("receiver_id"),
  videoId: int("video_id"),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── Monetization: Platform Fee ────────────────────────────────

export const platformFee = mysqlTable("platform_fee", {
  id: int("id").primaryKey().autoincrement(),
  giftSendId: int("gift_send_id").notNull(),
  senderId: int("sender_id").notNull(),
  receiverId: int("receiver_id").notNull(),
  totalCoins: int("total_coins").notNull(),
  receiverCoins: int("receiver_coins").notNull(),
  platformCoins: int("platform_coins").notNull(),
  feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull().default("50.00"),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Live Streaming ───────────────────────────────────────────

export const liveStreaming = mysqlTable("live_streaming", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  startedAt: datetime("started_at", { fsp: 3 }).notNull(),
  endedAt: datetime("ended_at", { fsp: 3 }).notNull(),
  duration: int("duration").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  earnCoin: int("earn_coin").notNull(),
});

export const liveStreamingWatch = mysqlTable("live_streaming_watch", {
  id: int("id").primaryKey().autoincrement(),
  liveStreamingId: int("live_streaming_id").notNull(),
  userId: int("user_id").notNull(),
  startedAt: datetime("started_at", { fsp: 3 }).notNull(),
  endedAt: datetime("ended_at", { fsp: 3 }).notNull(),
  duration: int("duration").notNull(),
  block: int("block").notNull(),
  coin: int("coin").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Room ──────────────────────────────────────────────────────

export const room = mysqlTable("room", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  privacy: int("privacy").notNull(),
  roomId: int("room_id").notNull(),
  topicId: int("topic_id").notNull(),
  delete: int("delete").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const roomMember = mysqlTable("room_member", {
  id: int("id").primaryKey().autoincrement(),
  roomId: int("room_id").notNull(),
  userId: int("user_id").notNull(),
  moderator: int("moderator").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── User Document ────────────────────────────────────────────

export const userDocument = mysqlTable("user_document", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  identification: varchar("identification", { length: 255 }).notNull(),
  identificationApprove: int("indentification_approve").notNull(),
  vehicleRegistration: varchar("vehicle_registration", { length: 255 }).notNull(),
  vehicleRegistrationApprove: int("vehicle_registration_approve").notNull(),
  drivingLicense: varchar("driving_license", { length: 255 }).notNull(),
  drivingLicenseApprove: int("driving_license_approve").notNull(),
  vehicleInsurance: varchar("vehicle_insurance", { length: 255 }).notNull(),
  vehicleInsuranceApprove: int("vehicle_insurance_approve").notNull(),
  updated: datetime("updated", { fsp: 3 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Card ──────────────────────────────────────────────────────

export const card = mysqlTable("card", {
  id: int("id").primaryKey().autoincrement(),
  card: varchar("card", { length: 255 }).notNull(),
  userId: int("user_id").notNull(),
  last4: int("last_4").notNull(),
  brand: varchar("brand", { length: 25 }).notNull(),
  expMonth: int("exp_month").notNull(),
  expYear: int("exp_year").notNull(),
  cardId: varchar("card_id", { length: 255 }).notNull(),
  paymentMethodId: varchar("payment_method_id", { length: 255 }).notNull(),
  default: int("default").notNull().default(1),
  email: varchar("email", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Privacy Setting ──────────────────────────────────────────

export const privacySetting = mysqlTable("privacy_setting", {
  id: int("id").primaryKey(),
  videosDownload: int("videos_download").notNull().default(1),
  directMessage: varchar("direct_message", { length: 255 }).notNull(),
  duet: varchar("duet", { length: 255 }).notNull(),
  likedVideos: varchar("liked_videos", { length: 255 }).notNull(),
  videoComment: varchar("video_comment", { length: 255 }).notNull(),
});

// ── Playlist ──────────────────────────────────────────────────

export const playlist = mysqlTable("playlist", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const playlistVideo = mysqlTable("playlist_video", {
  id: int("id").primaryKey().autoincrement(),
  playlistId: int("playlist_id").notNull(),
  videoId: int("video_id").notNull(),
  order: int("order").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Location ──────────────────────────────────────────────────

export const location = mysqlTable("location", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }),
  string: varchar("string", { length: 255 }).notNull(),
  lat: varchar("lat", { length: 255 }).notNull(),
  long: varchar("long", { length: 255 }).notNull(),
  googlePlaceId: text("google_place_id").notNull(),
  image: varchar("image", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Countries / States / Cities ────────────────────────────────

export const countries = mysqlTable("countries", {
  id: int("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  iso3: varchar("iso3", { length: 3 }),
  shortName: varchar("short_name", { length: 2 }),
  phonecode: varchar("phonecode", { length: 255 }),
  capital: varchar("capital", { length: 255 }),
  currency: varchar("currency", { length: 255 }),
  native: varchar("native", { length: 255 }),
  region: varchar("region", { length: 255 }),
  subregion: varchar("subregion", { length: 255 }),
  emoji: varchar("emoji", { length: 191 }),
  emojiU: varchar("emojiU", { length: 191 }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  flag: tinyint("flag").notNull().default(1),
  wikiDataId: varchar("wikiDataId", { length: 255 }),
  active: int("active").notNull(),
});

export const states = mysqlTable("states", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  countryId: int("country_id").notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  fipsCode: varchar("fips_code", { length: 255 }),
  shortName: varchar("short_name", { length: 255 }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  flag: tinyint("flag").notNull().default(1),
  wikiDataId: varchar("wikiDataId", { length: 255 }),
  active: int("active").notNull(),
});

export const cities = mysqlTable("cities", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  stateId: int("state_id").notNull(),
  stateCode: varchar("state_code", { length: 255 }).notNull(),
  countryId: int("country_id").notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`'2014-01-01 01:01:01'`),
  updatedOn: timestamp("updated_on").notNull().default(sql`CURRENT_TIMESTAMP`),
  flag: tinyint("flag").notNull().default(1),
  wikiDataId: varchar("wikiDataId", { length: 255 }),
  active: int("active").notNull(),
});

// ── Audience ──────────────────────────────────────────────────

export const audience = mysqlTable("audience", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  minAge: int("min_age").notNull(),
  maxAge: int("max_age").notNull(),
  gender: varchar("gender", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const audienceLocation = mysqlTable("audience_location", {
  id: int("id").primaryKey(),
  audienceId: int("audience_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cityId: int("city_id").notNull(),
  stateId: int("state_id").notNull(),
  countryId: int("country_id").notNull(),
});

// ── Professions ──────────────────────────────────────────────

export const professions = mysqlTable("professions", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  status: tinyint("status").default(1),
  created: datetime("created", { fsp: 3 }),
});

// ── Communication: Banner ────────────────────────────────────

export const banner = mysqlTable("banners", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 500 }).notNull(),
  redirectUrl: varchar("redirect_url", { length: 500 }),
  status: mysqlEnum("status", ["ongoing", "upcoming", "finished"]).notNull().default("upcoming"),
  sortOrder: int("sort_order").notNull().default(0),
  startDate: datetime("start_date", { fsp: 3 }),
  endDate: datetime("end_date", { fsp: 3 }),
  created: datetime("created", { fsp: 3 }).notNull(),
  modified: datetime("modified", { fsp: 3 }).notNull(),
});

// ── Communication: Official Notification ─────────────────────

export const officialNotification = mysqlTable("official_notifications", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("text"),
  url: varchar("url", { length: 500 }),
  image: varchar("image", { length: 500 }),
  targetUserId: int("target_user_id"),
  isRead: tinyint("is_read").default(0),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Communication: Push Notification ──────────────────────────

export const pushNotification = mysqlTable("push_notification", {
  id: int("id").primaryKey(),
  likes: int("likes").notNull(),
  comments: int("comments").notNull(),
  newFollowers: int("new_followers").notNull(),
  mentions: int("mentions").notNull(),
  directMessages: int("direct_messages").notNull(),
  videoUpdates: int("video_updates").notNull(),
});

// ── Interest / Interest Section ──────────────────────────────

export const interestSection = mysqlTable("interest_section", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  order: int("order").notNull(),
});

export const interest = mysqlTable("interest", {
  id: int("id").primaryKey().autoincrement(),
  interestSectionId: int("interest_section_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  order: int("order").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const userInterest = mysqlTable("user_interest", {
  id: int("id").primaryKey(),
  userId: int("user_id").notNull(),
  interestId: int("interest_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Referral ──────────────────────────────────────────────────

export const referralClicks = mysqlTable("referral_clicks", {
  id: int("id").primaryKey().autoincrement(),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  clickedAt: datetime("clicked_at", { fsp: 3 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 20 }),
  converted: tinyint("converted").default(0),
  convertedUserId: int("converted_user_id"),
});

export const referralUsed = mysqlTable("referral_used", {
  id: int("id").primaryKey().autoincrement(),
  referralOwner: int("referral_owner").notNull(),
  usedBy: int("used_by").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Daily Checkin ─────────────────────────────────────────────

export const dailyCheckin = mysqlTable("daily_checkin", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  coin: int("coin").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  dayNumber: int("day_number").default(1),
});

// ── Email Verification ────────────────────────────────────────

export const emailVerification = mysqlTable("email_verification", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 255 }).notNull(),
  code: int("code").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Phone No Verification ──────────────────────────────────────

export const phoneNoVerification = mysqlTable("phone_no_verification", {
  id: int("id").primaryKey().autoincrement(),
  phoneNo: varchar("phone_no", { length: 20 }).notNull(),
  code: int("code").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Device ────────────────────────────────────────────────────

export const device = mysqlTable("device", {
  id: int("id").primaryKey().autoincrement(),
  key: varchar("key", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Payout ────────────────────────────────────────────────────

export const payout = mysqlTable("payout", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Cart Slider ──────────────────────────────────────────────

export const cartSlider = mysqlTable("cart_slider", {
  id: int("id").primaryKey().autoincrement(),
  image: varchar("image", { length: 255 }).notNull(),
  url: varchar("url", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Shop Slider ──────────────────────────────────────────────

export const shopSlider = mysqlTable("shop_slider", {
  id: int("id").primaryKey().autoincrement(),
  image: varchar("image", { length: 255 }).notNull(),
  url: varchar("url", { length: 255 }).notNull(),
});

// ── Sound Favourite ──────────────────────────────────────────

export const soundFavourite = mysqlTable("sound_favourite", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  soundId: int("sound_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Sticker Used ──────────────────────────────────────────────

export const stickerUsed = mysqlTable("sticker_used", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  stickerId: int("sticker_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Shipping Rate ────────────────────────────────────────────

export const shippingRate = mysqlTable("shipping_rate", {
  id: int("id").primaryKey().autoincrement(),
  countryId: int("country_id").notNull(),
  weightMin: decimal("weight_min", { precision: 10, scale: 2 }).notNull(),
  weightMax: decimal("weight_max", { precision: 10, scale: 2 }).notNull(),
  quantityMin: int("quantity_min").notNull(),
  quantityMax: int("quantity_max").notNull(),
  orderPrice: int("order_price").notNull(),
  shippingFee: decimal("shipping_fee", { precision: 10, scale: 2 }).notNull(),
});

// ── Order Session / Transaction ──────────────────────────────

export const orderSession = mysqlTable("order_session", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  string: text("string").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const orderTransaction = mysqlTable("order_transaction", {
  id: int("id").primaryKey().autoincrement(),
  cartRandomId: int("cart_random_id").notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ── Payment Card ──────────────────────────────────────────────

export const paymentCard = mysqlTable("payment_card", {
  id: int("id").primaryKey().autoincrement(),
  stripe: varchar("stripe", { length: 255 }).notNull(),
  last4: int("last_4").notNull(),
  brand: varchar("brand", { length: 255 }).notNull(),
  expMonth: int("exp_month").notNull(),
  expYear: int("exp_year").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
  userId: int("user_id").notNull(),
  default: int("default").notNull(),
});

// ── Store ──────────────────────────────────────────────────────

export const store = mysqlTable("store", {
  id: int("id").primaryKey(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  about: text("about").notNull(),
  logo: varchar("logo", { length: 255 }).notNull(),
  cover: varchar("cover", { length: 255 }).notNull(),
  shippingBaseFee: float("shipping_base_fee").notNull(),
  shippingFeePerDistance: float("shipping_fee_per_distance").notNull(),
  distanceUnit: varchar("distance_unit", { length: 10 }).notNull(),
  active: int("active").notNull().default(1),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const storeAddress = mysqlTable("store_address", {
  id: int("id").primaryKey(),
  storeId: int("store_id").notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  latitude: varchar("latitude", { length: 255 }).notNull(),
  longitude: varchar("longitude", { length: 255 }).notNull(),
  zipcode: varchar("zipcode", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  streetAddr: varchar("street_addr", { length: 255 }).notNull(),
  aptSuite: varchar("apt_suite", { length: 200 }).notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const storeCoupon = mysqlTable("store_coupon", {
  id: int("id").primaryKey(),
  storeId: int("store_id").notNull(),
  couponCode: varchar("coupon_code", { length: 255 }).notNull(),
  discount: float("discount").notNull(),
  expiryDate: date("expiry_date").notNull(),
  limitUsers: int("limit_users").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const storeCouponUsed = mysqlTable("store_coupon_used", {
  id: int("id").primaryKey(),
  orderId: int("order_id").notNull(),
  couponId: int("coupon_id").notNull(),
  userId: int("user_id").notNull(),
  created: datetime("created", { fsp: 3 }).notNull(),
});

export const storeLocalHours = mysqlTable("store_local_hours", {
  id: int("id").primaryKey(),
  storeId: int("store_id").notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  operational: varchar("operational", { length: 200 }),
  delivery: varchar("delivery", { length: 200 }),
  pickup: varchar("pickup", { length: 200 }),
  dineIn: varchar("dine_in", { length: 200 }),
  created: datetime("created", { fsp: 3 }).notNull(),
});

// ══════════════════════════════════════════════════════════════
// NEW TABLES (Admin Panel RBAC + Audit)
// ══════════════════════════════════════════════════════════════

export const auditLog = mysqlTable("audit_log", {
  id: int("id").primaryKey().autoincrement(),
  adminId: int("admin_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: int("entity_id"),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  created: timestamp("created").defaultNow(),
});

export const role = mysqlTable("role", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  created: timestamp("created").defaultNow(),
});

export const permission = mysqlTable("permission", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  module: varchar("module", { length: 50 }),
  created: timestamp("created").defaultNow(),
});

export const rolePermission = mysqlTable("role_permission", {
  id: int("id").primaryKey().autoincrement(),
  roleId: int("role_id"),
  permissionId: int("permission_id"),
  created: timestamp("created").defaultNow(),
});

export const adminRole = mysqlTable("admin_role", {
  id: int("id").primaryKey().autoincrement(),
  adminId: int("admin_id"),
  roleId: int("role_id"),
  created: timestamp("created").defaultNow(),
});

export const dashboardWidget = mysqlTable("dashboard_widget", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }),
  type: varchar("type", { length: 50 }),
  config: json("config"),
  sortOrder: int("sort_order").default(0),
  isActive: int("is_active").default(1),
  created: timestamp("created").defaultNow(),
});