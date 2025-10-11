# Push Notification Implementation - Completion Guide

## ✅ Completed Steps

The following has been successfully implemented:

### Client-Side
1. ✅ Installed `web-push` and `@types/web-push` packages
2. ✅ Updated service worker (`src/client/sw.ts`) with push event handlers
3. ✅ Created `PushManager` utility (`src/client/utils/PushManager.ts`)
4. ✅ Added `enable_push_notifications` preference to `PreferencesManager.ts`
5. ✅ Added push notification toggle to `PreferencesDialog.vue`
6. ✅ Added API paths to `src/common/app/paths.ts`

### Server-Side
7. ✅ Created `PushSubscription` data model (`src/server/player/PushSubscription.ts`)
8. ✅ Created `PushNotificationSender` utility (`src/server/utils/PushNotificationSender.ts`)
9. ✅ Extended `IDatabase` interface with push subscription methods

## 🚧 Remaining Implementation Steps

The following steps still need to be completed (see WEB_PUSH_IMPLEMENTATION.md for detailed code):

### Database Implementation
1. **PostgreSQL** (`src/server/database/PostgreSQL.ts`):
   - Add table creation in `initialize()` method
   - Implement 5 push subscription methods

2. **SQLite** (`src/server/database/SQLite.ts`):
   - Add table creation in `initialize()` method
   - Implement 5 push subscription methods

3. **LocalFilesystem** (`src/server/database/LocalFilesystem.ts`):
   - Implement 5 push subscription methods (file-based storage)

### API Routes
4. Create `src/server/routes/ApiPushSubscribe.ts`
5. Create `src/server/routes/ApiPushUnsubscribe.ts`
6. Register routes in `src/server/server/requestProcessor.ts`

### Game Integration
7. Add push notification trigger in game logic (when player becomes active)
   - Likely location: when `Player.setWaitingFor()` is called
   - Or in `ApiWaitingFor.ts` when status changes to 'GO'

### Configuration & Settings
8. Update `.env.sample` with VAPID configuration examples
9. Expose VAPID public key to client via settings generation
10. Add translations for all 13 locales in `src/locales/*/preferences.json`

### Documentation
11. Update `CLAUDE.md` with push notification setup instructions

## 📋 Required Configuration Steps (After Implementation)

Once implementation is complete, you'll need to:

### 1. Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```

### 2. Add Keys to .env
```bash
VAPID_PUBLIC_KEY=<your_public_key_here>
VAPID_PRIVATE_KEY=<your_private_key_here>
VAPID_SUBJECT=mailto:your-email@example.com
```

### 3. Rebuild Application
```bash
npm install
npm run build
```

### 4. Restart Server
```bash
npm start
```

### 5. Test Notifications
1. Open game in browser (must be HTTPS or localhost)
2. Go to Preferences
3. Enable "Push notifications"
4. Grant browser permission
5. Close browser tab
6. Have another player make it your turn
7. Verify push notification appears

## 📝 Quick Reference

**Implementation Guide**: See `WEB_PUSH_IMPLEMENTATION.md` for complete code examples

**Files Modified**: 13 files
**Files Created**: 7 new files
**Database Methods**: 5 methods per database backend
**Translations Needed**: 2 strings × 13 locales = 26 translations

## 🔍 Testing Checklist

- [ ] Push notifications appear when browser tab is closed
- [ ] Push notifications appear when browser is completely closed
- [ ] Clicking notification opens/focuses game tab
- [ ] Subscriptions persist across page reloads
- [ ] Unsubscribe works correctly
- [ ] Works on Chrome/Edge
- [ ] Works on Firefox
- [ ] Works on Safari (iOS 16.4+/macOS 13+)
- [ ] Multiple devices can subscribe for same player
- [ ] Invalid subscriptions are cleaned up automatically

## 💡 Notes

- VAPID keys are server-specific - generate new ones for each deployment
- Keep private key secret - never commit to git
- Push notifications only work over HTTPS (except localhost)
- Service worker must be registered before push subscription
- Browser notification permission is required

For detailed implementation code, refer to `WEB_PUSH_IMPLEMENTATION.md`.
