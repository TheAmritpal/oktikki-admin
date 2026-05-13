import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createAdminSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  roleId: z.coerce.number().int().positive("Select a role"),
});

export const updateAdminSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  roleId: z.coerce.number().int().positive().optional(),
  active: z.coerce.number().min(0).max(1).optional(),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const blockUserSchema = z.object({
  block: z.coerce.number().min(0).max(1),
  intent: z.string().optional(),
});

export const createUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().optional(),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  gender: z.string().min(1, "Gender is required"),
  role: z
    .enum([
      "user",
      "svip",
      "svip2",
      "svip3",
      "host",
      "coin_seller",
      "sub_agency",
      "agency",
      "bd",
      "bd_head",
      "official",
    ])
    .default("user"),
  verified: z.coerce.number().min(0).max(1).default(0),
  active: z.coerce.number().min(0).max(1).default(1),
  dob: z.string().optional(),
  bio: z.string().optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  wallet: z.coerce.number().int().nonnegative().default(0),
});

export const updateUserSchema = z.object({
  userId: z.coerce.number().int().positive(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().optional(),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional()
    .or(z.literal("")),
  gender: z.string().min(1, "Gender is required"),
  role: z.enum([
    "user",
    "svip",
    "svip2",
    "svip3",
    "host",
    "coin_seller",
    "sub_agency",
    "agency",
    "bd",
    "bd_head",
    "official",
  ]),
  verified: z.coerce.number().min(0).max(1),
  active: z.coerce.number().min(0).max(1),
  dob: z.string().optional(),
  bio: z.string().optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  wallet: z.coerce.number().int().nonnegative(),
});

export const rechargeWalletSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  intent: z.string().optional(),
});

export const createSoundSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  soundSectionId: z.coerce.number().int().positive("Section is required"),
  publish: z.coerce.number().min(0).max(1).default(1),
});

export const updateSoundSchema = z.object({
  soundId: z.coerce.number().int().positive(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  soundSectionId: z.coerce.number().int().positive("Section is required"),
});

export const createSoundSectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const updateSoundSectionSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  name: z.string().min(1, "Name is required"),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const createTopicSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const createCouponSchema = z.object({
  couponCode: z.string().min(1, "Coupon code is required"),
  limitUsers: z.coerce.number().int().positive().optional(),
  discount: z.coerce.number().positive("Discount must be positive"),
  expiryDate: z.string().optional(),
});

export const createGiftSchema = z.object({
  title: z.string().min(1, "Title is required"),
  coin: z.coerce.number().int().positive("Coin price must be positive"),
  position: z.string().default(""),
});

export const updateGiftSchema = z.object({
  giftId: z.coerce.number().int().positive(),
  title: z.string().min(1, "Title is required"),
  coin: z.coerce.number().int().positive("Coin price must be positive"),
  position: z.string(),
  time: z.string().optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const createBannerSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  redirectUrl: z.string().optional(),
  status: z.enum(["ongoing", "upcoming", "finished"]).default("ongoing"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const updateSettingsSchema = z.object({
  type: z.string().min(1, "Key is required"),
  value: z.string().optional(),
});

export const sendNotificationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  target: z.enum(["all", "specific"]),
  userIds: z.string().optional(),
  url: z.string().optional(),
});

export const withdrawalActionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
  intent: z.string().optional(),
});

export const verificationActionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
  intent: z.string().optional(),
});

export const createAppSliderSchema = z.object({
  url: z.string().min(1, "URL is required"),
  ecommerce: z.coerce.number().int().min(0).max(1),
});

export const updateAppSliderSchema = z.object({
  sliderId: z.coerce.number().int().positive(),
  url: z.string().min(1, "URL is required"),
  ecommerce: z.coerce.number().int().min(0).max(1),
});

export const createStickerSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.coerce.number().int().min(0, "Type is required"),
});

export const updateStickerSchema = z.object({
  stickerId: z.coerce.number().int().positive(),
  title: z.string().min(1, "Title is required"),
  type: z.coerce.number().int().min(0, "Type is required"),
});

export const resetPasswordSchema = z.object({
  userId: z.coerce.number().int().positive(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const sendWarningSchema = z.object({
  userId: z.coerce.number().int().positive(),
  message: z.string().min(1, "Message is required"),
});

export const removeTickSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});