import { initializeApp, applicationDefault } from "firebase-admin/app";

export const firebaseApp = initializeApp({
  credential: applicationDefault(),
});
