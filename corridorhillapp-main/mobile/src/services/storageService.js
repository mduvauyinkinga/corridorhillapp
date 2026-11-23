/**
 * services/storageService.js
 * ------------------------------------------------------------------
 * Complaint photo uploads — port of the website's `js/upload.js`.
 *
 * Same storage path   : complaints-photos/{uid}/{timestamp}_{random}.{ext}
 * Same validation     : jpg/jpeg/png/webp and <= 5 MB per image
 * Same security model : storage.rules only allow a signed-in user to write
 *                       inside their OWN uid folder with an image/* content
 *                       type below 5 MB. The mobile client performs the
 *                       same pre-flight validation for a friendly error,
 *                       but the rules remain the real boundary.
 *
 * Implementation note (mobile specific, no data/behaviour change): React
 * Native has no <input type="file">, so `expo-image-picker` returns a local
 * file URI which is converted to a Blob and uploaded with
 * `uploadBytesResumable` exactly like the web client does.
 */

import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

import { storage } from "../config/firebase";
import { ALLOWED_IMAGE_EXT, validateImageAsset } from "../utils/validation";

/** Build the deterministic-ish storage file name used by js/upload.js. */
function buildFileName(asset) {
  const source = asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
  const ext = (source.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ALLOWED_IMAGE_EXT.includes(ext) ? ext : "jpg";
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}_${random}.${safeExt}`;
}

/** Content type sent to Storage (rules require image/jpeg|png|webp). */
function resolveContentType(asset, fileName) {
  if (asset.mimeType && asset.mimeType.startsWith("image/")) return asset.mimeType;
  const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Convert a local file URI into a Blob (React Native fetch supports file://). */
async function uriToBlob(uri) {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Upload one complaint photo.
 * @param {object} asset expo-image-picker asset ({ uri, fileName, mimeType, fileSize }).
 * @param {string} uid   the signed-in user's uid (must match the storage path).
 * @param {(percent:number)=>void} [onProgress] 0-100 progress callback.
 * @returns {Promise<string>} the download URL stored in `complaints.photoURLs`.
 */
export async function uploadComplaintPhoto(asset, uid, onProgress) {
  const validationError = validateImageAsset(asset);
  if (validationError) throw new Error(validationError);
  if (!uid) throw new Error("You must be signed in to upload photos.");

  const fileName = buildFileName(asset);
  const contentType = resolveContentType(asset, fileName);
  const storageRef = ref(storage, `complaints-photos/${uid}/${fileName}`);
  const blob = await uriToBlob(asset.uri);

  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        if (!onProgress || !snapshot.totalBytes) return;
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(percent);
      },
      (error) => reject(error),
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
