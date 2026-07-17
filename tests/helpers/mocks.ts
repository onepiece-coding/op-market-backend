import { vi } from "vitest";
import * as paypalService from "../../src/services/paypalService.js";
import * as cloudinaryService from "../../src/services/cloudinary.js";
import sendEmail from "../../src/services/emailService.js";

export const mockCreatePayPalOrder = vi.spyOn(
  paypalService,
  "createPayPalOrder",
);

export const mockCapturePayPalOrder = vi.spyOn(
  paypalService,
  "capturePayPalOrder",
);

export const mockUploadImageBuffer = vi.spyOn(
  cloudinaryService,
  "uploadImageBuffer",
);

export const mockRemoveImage = vi.spyOn(cloudinaryService, "removeImage");

export const mockSendEmail = vi.spyOn({ sendEmail }, "sendEmail");

export const resetServiceMocks = () => {
  mockCreatePayPalOrder.mockReset();
  mockCapturePayPalOrder.mockReset();
  mockUploadImageBuffer.mockReset();
  mockRemoveImage.mockReset();
  mockSendEmail.mockReset();
};

export const mockPayPalCreateSuccess = (overrides?: {
  paypalOrderId?: string;
  approvalUrl?: string | null;
  raw?: {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };
}) => {
  const paypalOrderId = overrides?.paypalOrderId ?? "paypal-order-123";
  const approvalUrl =
    overrides?.approvalUrl ?? "https://paypal.test/checkout/paypal-order-123";

  mockCreatePayPalOrder.mockResolvedValue({
    paypalOrderId,
    approvalUrl,
    raw: overrides?.raw ?? {
      id: paypalOrderId,
      links: approvalUrl ? [{ rel: "approve", href: approvalUrl }] : undefined,
    },
  });
};

export const mockPayPalCreateFailure = (error?: Error) => {
  mockCreatePayPalOrder.mockRejectedValue(
    error ?? new Error("PayPal create failed"),
  );
};

export const mockPayPalCaptureSuccess = (status = "COMPLETED") => {
  mockCapturePayPalOrder.mockResolvedValue({ status });
};

export const mockPayPalCaptureFailure = (error?: Error) => {
  mockCapturePayPalOrder.mockRejectedValue(
    error ?? new Error("PayPal capture failed"),
  );
};

export const mockCloudinaryUploadSuccess = (overrides?: {
  secure_url?: string;
  url?: string;
  public_id?: string;
}) => {
  mockUploadImageBuffer.mockResolvedValue({
    secure_url:
      overrides?.secure_url ??
      "https://res.cloudinary.com/demo/image/upload/test.jpg",
    url:
      overrides?.url ?? "https://res.cloudinary.com/demo/image/upload/test.jpg",
    public_id: overrides?.public_id ?? "op-market/products/test-image",
  } as Awaited<ReturnType<typeof cloudinaryService.uploadImageBuffer>>);
};

export const mockCloudinaryUploadFailure = (error?: Error) => {
  mockUploadImageBuffer.mockRejectedValue(
    error ?? new Error("Cloudinary upload failed"),
  );
};

export const mockCloudinaryRemoveSuccess = () => {
  mockRemoveImage.mockResolvedValue({ result: "ok" } as never);
};

export const mockCloudinaryRemoveFailure = (error?: Error) => {
  mockRemoveImage.mockRejectedValue(
    error ?? new Error("Cloudinary remove failed"),
  );
};

export const mockEmailSuccess = () => {
  mockSendEmail.mockResolvedValue({
    ok: true,
    message: "Email send mocked",
  });
};

export const mockEmailFailure = (error?: Error) => {
  mockSendEmail.mockRejectedValue(error ?? new Error("Email send failed"));
};
