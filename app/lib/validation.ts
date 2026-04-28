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

export const rechargeWalletSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  intent: z.string().optional(),
});

export const createSoundSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  publish: z.coerce.number().min(0).max(1).default(1),
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
  name: z.string().min(1, "Name is required"),
  coinPrice: z.coerce.number().int().nonnegative("Coin price is required"),
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

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});