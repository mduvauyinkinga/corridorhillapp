/**
 * upload.js
 * ------------------------------------------------------------------
 * Firebase Storage helpers for complaint photo attachments.
 *
 * - Validates file type (jpg / jpeg / png / webp).
 * - Validates file size (max 5 MB each).
 * - Uploads to `complaints-photos/{uid}/...` with a progress callback.
 * - Returns the download URL after a successful upload.
 */

import { storage } from "./firebase.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/** Allowed image MIME types. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Allowed file extensions. */
export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

/** Maximum file size per image (bytes). */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validate a single image file.
 * Returns an error message string, or null if the file is acceptable.
 */
export function validateImageFile(file) {
  if (!file) return "No file selected.";

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const okType = ALLOWED_IMAGE_TYPES.includes(file.type);
  const okExt = ALLOWED_IMAGE_EXT.includes(ext);

  if (!okType && !okExt) {
    return "Only JPG, JPEG, PNG or WEBP images are allowed.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Each image must be 5 MB or smaller.";
  }
  return null;
}

/**
 * Upload a single image file to Firebase Storage.
 * @param {File} file - The image file to upload.
 * @param {string} userId - The authenticated user's UID.
 * @param {function(number):void} onProgress - Called with a 0-100 percent integer.
 * @returns {Promise<string>} The download URL.
 */
export function uploadImage(file, userId, onProgress) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, `complaints-photos/${userId}/${name}`);

  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        if (onProgress) onProgress(percent);
      },
      (error) => {
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(url);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}
