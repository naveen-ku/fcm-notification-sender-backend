import { createApp } from "./app.js";
import { env } from "./config/env.js";
import "./services/firebase.js";

const port = env.port;

createApp().listen(port, (error) => {
  if (error) throw error;
  console.log(`[server]: listening on http://localhost:${port}`);
});
