# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an open-source implementation of the board game Terraforming Mars, built with TypeScript, Vue.js 2, Node.js, and supporting multiple database backends (PostgreSQL, SQLite, or local filesystem).

## Common Commands

### Development
```bash
# Build everything (server, client, static assets)
npm run build

# Development mode with auto-reload
npm run dev:server  # Server with auto-reload (requires dev:prepare first)
npm run dev:client  # Client with webpack watch

# Before dev mode, remove gzipped files for auto-reload to work
npm run dev:prepare

# Start the production server
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run only server tests
npm run test:server

# Run only client tests
npm run test:client

# Run client tests in watch mode
npm run test:client:watch

# Run integration tests (no timeout)
npm run test:integration

# Run PostgreSQL-specific tests
npm run test:postgresql

# Run a single test file
npx ts-mocha -p tests/tsconfig.json tests/path/to/test.spec.ts
```

### Linting
```bash
# Lint everything (server, client, i18n)
npm run lint

# Lint only server/test TypeScript
npm run lint:server

# Lint only Vue components (client)
npm run lint:client

# Lint translation files
npm run lint:i18n

# Auto-fix linting issues
npm run lint:fix
```

### Building Components
```bash
# Build server only
npm run build:server

# Build client only (requires make:cards first)
npm run build:client

# Generate static assets (CSS and JSON)
npm run make:static

# Generate card rendering data (required before building client)
npm run make:cards

# Generate CSS from LESS
npm run make:css

# Watch CSS changes
npm run watch:css
```

## Code Architecture

### Project Structure

- **`src/server/`** - Server-side TypeScript code
  - `Game.ts` - Core game engine and state management (~2000 LOC)
  - `Player.ts` - Player state and actions (~2000 LOC)
  - `cards/` - All game cards organized by expansion
  - `boards/` - Game board implementations (Tharsis, Hellas, Elysium, etc.)
  - `behavior/` - Behavior system for declarative card effects
  - `deferredActions/` - Asynchronous action queue system
  - `routes/` - HTTP API endpoints
  - `database/` - Database abstraction layer (PostgreSQL/SQLite/LocalFilesystem)
  - `server/` - HTTP server and request processing
  - `milestones/`, `awards/` - Milestone and award implementations
  - `colonies/`, `turmoil/`, `moon/`, `pathfinders/`, `underworld/` - Expansion-specific code

- **`src/client/`** - Client-side Vue.js code
  - `main.ts` - Client entry point
  - `components/` - Vue components
  - All client code is TypeScript with Vue 2.6 single-file components

- **`src/common/`** - Shared code between client and server
  - Type definitions, enums, constants
  - Models for serialization

- **`tests/`** - Test files mirroring `src/` structure
  - Uses Mocha + Chai for testing
  - `TestingUtils.ts` - Helper functions for creating test games
  - `TestPlayer.ts` - Test player implementation

### Key Architectural Patterns

#### 1. Card System
Cards are the heart of the game. There are multiple approaches to implementing cards:

**Modern Approach (Declarative Behavior):**
Cards use the `Behavior` system (see `src/server/behavior/Behavior.ts`) which allows declaring card effects in a JSON-like structure:

```typescript
export class InventorsGuild extends ActionCard {
  constructor() {
    super({
      type: CardType.ACTIVE,
      name: CardName.INVENTORS_GUILD,
      tags: [Tag.SCIENCE],
      cost: 9,
      action: {
        drawCard: {count: 1, pay: true},
      },
    });
  }
}
```

The behavior system handles common patterns like:
- Resource production changes
- Stock changes (megacredits, steel, titanium, etc.)
- Placing tiles (cities, greeneries, oceans)
- Drawing/discarding cards
- Raising global parameters (temperature, oxygen, venus)

**Legacy Approach (Imperative):**
Older cards implement `play()` and `canPlay()` methods directly. New cards should use the behavior system when possible.

#### 2. Game State & Deferred Actions
The game uses a deferred action queue (`DeferredActionsQueue`) to handle complex multi-step player interactions:

- Actions are queued and resolved in priority order
- Players can only see one input at a time
- State is serialized/deserialized for persistence
- See `src/server/deferredActions/` for examples

#### 3. Database Abstraction
The game supports three database backends through `IDatabase` interface:
- **PostgreSQL** - Production deployment (configurable via `DATABASE_URL` env var)
- **SQLite** - Lightweight single-file database
- **LocalFilesystem** - JSON file storage (enabled via `LOCAL_FS_DB` env var)

Database selection happens at runtime in `Database.ts`.

#### 4. Server Architecture
- HTTP server in `src/server/server.ts` initializes database, session manager, and game loader
- Request routing in `src/server/server/requestProcessor.ts` dispatches to handlers in `src/server/routes/`
- API is JSON-based with routes like `/api/game`, `/api/player`, `/api/waitingfor`
- Game state is cached in memory and persisted to database
- Uses Prometheus for metrics

#### 5. Client-Server Communication
- Client polls `/api/waitingfor` for player input
- Player submits responses via `/player/input`
- Game state updates are fetched via `/api/player`
- Uses Vue 2 for reactive UI updates

### Card Implementation Guidelines

When implementing a new card:

1. **Choose the right base class:**
   - `Card` - Most project cards
   - `ActionCard` - Cards with action abilities
   - `CorporationCard` - Corporation cards
   - `PreludeCard` - Prelude cards
   - `CeoCard` - CEO cards

2. **Use the Behavior system** for standard effects (production, resources, tiles, etc.)

3. **Implement custom logic only when necessary:**
   - Override `play()` for complex card logic
   - Override `canPlay()` for custom playability checks
   - Implement `IActionCard` for action cards
   - Add victory point calculations via `victoryPoints` or `getVictoryPoints()`

4. **Card requirements:**
   - Use `requirements` property with declarative requirement objects
   - See `src/server/cards/requirements/` for requirement types

5. **Always add tests:**
   - Create test file in `tests/cards/[expansion]/`
   - Test card playability, effects, and edge cases
   - Use `TestingUtils.testGame()` to create test games

### Testing Guidelines

- Use `testGame()` from `TestingUtils.ts` to create games with specific options
- `TestPlayer` provides helper methods for testing player state
- Use `maxOutOceans()`, `setTemperature()`, etc. to set up board state
- Test both successful and failing scenarios
- Integration tests go in `tests/integration/`

### Configuration

The project uses:
- **TypeScript 4.7** with strict type checking
- **ESLint** with Google style config
- **Webpack** for client bundling
- **Environment variables** via `.env` file (see `.env.sample`)

Key tsconfig settings:
- Separate configs for `src/` and `tests/`
- Path mapping enabled via `tsconfig-paths`
- Server outputs to `build/src/`, tests to `build/tests/`

### Push Notifications

The application supports browser push notifications to alert players when it's their turn, even when the browser is closed.

**Setup:**

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```

2. Add keys to `.env`:
   ```bash
   VAPID_PUBLIC_KEY=<your_public_key>
   VAPID_PRIVATE_KEY=<your_private_key>
   VAPID_SUBJECT=mailto:admin@example.com
   SERVER_URL=https://yourdomain.com  # For notification links
   ```

3. Rebuild and restart:
   ```bash
   npm run build
   npm start
   ```

**How it works:**

- Client subscribes to push notifications via Service Worker API
- Subscriptions stored in database (all three backends supported)
- When `Player.setWaitingFor()` is called, push notification is sent
- `PushNotificationSender` handles sending and cleanup of expired subscriptions
- Users enable/disable in Preferences dialog

**Key files:**
- `src/server/utils/PushNotificationSender.ts` - Server-side push sender
- `src/client/utils/PushManager.ts` - Client-side subscription manager
- `src/client/sw.ts` - Service worker with push event handlers
- `src/server/routes/ApiPushSubscribe.ts` - Subscribe endpoint
- `src/server/routes/ApiPushUnsubscribe.ts` - Unsubscribe endpoint
- Database methods in `IDatabase` interface

**Notes:**
- Push notifications require HTTPS (except localhost)
- Browser must support Service Workers and Push API
- VAPID keys are server-specific - generate new ones per deployment
- Keep private key secret - never commit to source control

### Expansions

The codebase includes many Terraforming Mars expansions:
- Corporate Era (base)
- Venus Next
- Prelude & Prelude 2
- Colonies
- Turmoil
- The Moon
- Pathfinders
- Underworld
- Ares (hazards)
- Community (fan-made)
- CEOs
- Escape Velocity

Expansion-specific code is typically isolated in its own directory/namespace.

## Important Notes

- **Node version**: 16.x to 22.x (see package.json engines)
- **License**: GPLv3
- **Memory efficiency**: Card properties are cached statically to minimize memory per card instance
- **Game persistence**: Games serialize to JSON and can be saved/loaded from database
- **Randomness**: Uses `SeededRandom` for deterministic randomness (important for game replays)
