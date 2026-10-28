# fcm-notification-backend

Express service that sends Android push notifications through Firebase Cloud Messaging (FCM). A form posts a message to `POST /api/v1/notifications/send`; the server validates it and hands it to firebase-admin's `getMessaging()`.

## Setup

Requires Node.js 24+ and a Firebase service account key (JSON) for the Firebase project the Android app uses.

1. `npm install`
2. Copy `.env.example` to `.env` and set `GOOGLE_APPLICATION_CREDENTIALS` to the path of the service account file. `PORT` defaults to `8080`. `CORS_ORIGINS` is a comma-separated list of the browser origins allowed to call the API (default `http://localhost:3000`); Postman isn't affected by it.
3. `npm run dev` starts the server on `http://localhost:8080` and restarts it on changes.

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm start`.

## Request format

The request body is an Android FCM message in firebase-admin's format:

- **Exactly one target:** `token`, `topic`, `condition`, `fid`, `tokens` (up to 500) or `fids` (up to 500).
- **Content:** at least one of `notification` (`title`, `body`, `imageUrl`), `data` (string to string map) or `android.notification` / `android.data`.
- **Android options:** `android` takes firebase-admin's `AndroidConfig`, for example `priority` (`"high"` or `"normal"`), `ttl` in **milliseconds**, `collapseKey` and `notification.channelId`.
- **`dryRun: true`** asks FCM to validate the message without delivering it.

Field names and units follow firebase-admin, not the FCM REST docs: `ttl: 3600000`, not `"3600s"`, and `clickAction`, not `click_action`. `apns`, `webpush` and unknown fields are rejected, since only Android is supported.

```json
{
  "token": "<device registration token>",
  "notification": { "title": "Budget alert", "body": "You spent 90%" },
  "data": { "route": "/budgets/42" },
  "android": { "priority": "high", "ttl": 3600000 }
}
```

Registration tokens (`token`, `tokens`) are deprecated in firebase-admin 14 in favour of Firebase Installation IDs (`fid`, `fids`), but they still work.

## Testing with Postman

### 1. Open the collection

The **fcm-notification-backend** collection in the **Office** Postman workspace has every request ready to send. The same collection is in this repo at [postman/fcm-notification-backend.postman_collection.json](postman/fcm-notification-backend.postman_collection.json); to use the file instead, choose **Import** in Postman and select it.

### 2. Set the collection variables

Open the collection, then its **Variables** tab:

| Variable      | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| `baseUrl`     | `http://localhost:8080` (change it if the server runs elsewhere) |
| `deviceToken` | The FCM registration token of your Android device                |
| `deviceFid`   | The Firebase Installation ID of your Android device              |

Log both values from the Android app:

```kotlin
FirebaseMessaging.getInstance().token.addOnSuccessListener { Log.d("FCM", "token: $it") }
FirebaseInstallations.getInstance().id.addOnSuccessListener { Log.d("FCM", "fid: $it") }
```

A device token identifies a real phone, so keep it out of the collection file in this repo.

### 3. Send the requests in this order

| Request                                         | What it shows                                                                   | Needs                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| Get Health                                      | The server is running.                                                          | Nothing                           |
| Dry Run By Topic                                | FCM accepts the server's credentials and the message, without delivering it.    | Nothing                           |
| Reject … (5 requests)                           | Validation errors (400). These never reach FCM.                                 | Nothing                           |
| Send Notification By Token                      | A real notification arrives on your phone.                                      | `deviceToken`                     |
| Send Notification By Tokens                     | One call to several devices. The placeholder second token shows up in `errors`. | `deviceToken`                     |
| Send Simple Notification By Topic, By Condition | Delivery to topic subscribers.                                                  | The app subscribed to topic `all` |
| Send Notification By FID, By FIDs               | Delivery by Firebase Installation ID.                                           | `deviceFid`                       |

To subscribe the app to the `all` topic: `FirebaseMessaging.getInstance().subscribeToTopic("all")`.

Every request has tests in its **Scripts → Post-response** tab, so the **Test Results** tab shows whether it behaved as expected. To run several requests at once, use the collection's **Run** button, or the Postman CLI:

```sh
postman collection run postman/fcm-notification-backend.postman_collection.json \
  --env-var deviceToken=<token> -i "Get Health" -i "Send Notification By Token"
```

Send requests return 400 while `deviceToken` or `deviceFid` is empty.

### 4. Read the response

A successful send returns:

```json
{
  "successCount": 1,
  "failureCount": 0,
  "messageIds": ["projects/<project-id>/messages/<id>"],
  "invalidTargets": [],
  "errors": [],
  "sendAt": "2026-10-28T10:00:00.000Z"
}
```

For `tokens` and `fids`, each failed target is listed in `errors` with FCM's error code. Tokens or FIDs that FCM no longer recognises are also listed in `invalidTargets`, and can be deleted.

| Status | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| 200    | Sent. For `tokens` and `fids`, at least one target received it.                      |
| 400    | The request failed validation (see `error.details`), or FCM rejected the message.    |
| 404    | The token or FID is no longer registered; get a fresh one from the app.              |
| 429    | FCM rate limit; wait and retry.                                                      |
| 502    | Credentials or FCM problem, or a `tokens` / `fids` send where nothing was delivered. |

### Troubleshooting

- **Nothing appears on the phone:** Android shows a `notification` in the tray only while the app is in the background. In the foreground, the app's `onMessageReceived` receives it instead, and a message with only `data` never shows anything by itself.
- **`messaging/mismatched-credential`:** the token comes from a different Firebase project than the service account in `GOOGLE_APPLICATION_CREDENTIALS`.
- **The collection file and Postman differ:** both hold the same requests. After changing the collection in Postman, export it (**…** → **Export**, Collection v2.1) over the file in `postman/`. After changing the file, import it into Postman to replace the collection.
