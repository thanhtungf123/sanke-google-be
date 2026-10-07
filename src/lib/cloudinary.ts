import { v2 as cloudinary } from 'cloudinary';

// Cấu hình Cloudinary từ env. Dùng upload có chữ ký: backend ký, trình duyệt
// upload thẳng lên Cloudinary (api_secret không bao giờ ra client).
export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

// Tạo chữ ký cho một lần upload (ký đúng các tham số sẽ gửi: folder + timestamp).
export function signUpload(folder: string): UploadSignature {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret);
  return { cloudName, apiKey, timestamp, folder, signature };
}
