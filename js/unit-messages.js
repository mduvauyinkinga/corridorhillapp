import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

const MAX_MESSAGE_LENGTH = 500;
const ROOM_LETTERS = ["A", "B", "C"];

export async function fetchUnitMessages(roomId) {
  if (!roomId) return [];
  const snapshot = await getDocs(query(
    collection(db, "unitMessages"),
    where("roomId", "==", roomId),
    orderBy("createdAt", "desc")
  ));
  return snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }));
}

export async function fetchResidentMessages(uid) {
  if (!uid) return [];
  const snapshot = await getDocs(query(
    collection(db, "users", uid, "unitInbox"),
    orderBy("createdAt", "desc")
  ));
  return snapshot.docs.map((messageDoc) => ({
    id: messageDoc.id,
    ...messageDoc.data(),
  }));
}

export async function sendUnitMessage({
  roomId,
  block,
  unitNumber,
  roomLetter = null,
  recipientUids,
  message,
  authorId,
  authorName,
}) {
  const text = String(message || "").trim();
  const recipients = [...new Set(recipientUids || [])];
  if (!roomId || !block || !Number.isInteger(Number(unitNumber))) {
    throw new Error("A valid unit location is required.");
  }
  if (roomLetter !== null && !ROOM_LETTERS.includes(roomLetter)) {
    throw new Error("Choose the entire unit or a valid room letter.");
  }
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`);
  }
  if (recipients.length === 0 || recipients.length > 6) {
    throw new Error("There are no residents in the selected message audience.");
  }

  const messageRef = doc(collection(db, "unitMessages"));
  const createdAt = serverTimestamp();
  const messageData = {
    roomId,
    block,
    unitNumber: Number(unitNumber),
    roomLetter,
    recipientUids: recipients,
    message: text,
    authorId,
    authorName: authorName || "Management",
    createdAt,
  };
  const batch = writeBatch(db);
  batch.set(messageRef, messageData);
  recipients.forEach((uid) => {
    batch.set(doc(db, "users", uid, "unitInbox", messageRef.id), {
      messageId: messageRef.id,
      roomId,
      block,
      unitNumber: Number(unitNumber),
      roomLetter,
      message: text,
      authorId,
      authorName: authorName || "Management",
      createdAt,
    });
  });
  await batch.commit();
  return messageRef;
}

export function subscribeResidentMessages(uid, onMessages, onError) {
  if (!uid) return () => {};
  const inboxQuery = query(
    collection(db, "users", uid, "unitInbox"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    inboxQuery,
    (snapshot) => onMessages(snapshot.docs.map((messageDoc) => ({
      id: messageDoc.id,
      ...messageDoc.data(),
    }))),
    onError
  );
}