# Redis contention and client trust boundaries

## Why this patch exists

Player activity updates share the `io:player-registry` hash. Redis hash-field writes are atomic, and activity updates are already serialized per user through a distributed lease. Watching the entire registry caused independent users' updates to invalidate each other's transactions. Activity writes now watch only that user's lease while updating only that user's hash field.

The mutation-lock runtime also guarantees `unwatch()` if lock renewal or release exits with an exception before `exec()`. Roll and ticket-related infrastructure errors are logged with a stack trace and the current user ID so intermittent incidents can be diagnosed instead of only appearing as a transient UI message.

## What may move to the client

Safe client-side work includes animations, sounds, rarity formatting, display-only calculations, cooldown countdown rendering, tab state, and cached read-only presentation. These can improve responsiveness without changing what the server awards.

The following must remain server-authoritative: random orb generation, player currency and inventory changes, roll cooldowns, rarity and reward calculation, ticket validation, quest/progression rewards, guild taxes, and save revisions/generations. A client can be modified, so a client-reported result or balance must never be trusted.

## Roll-ticket trust protocol

The first-party client obtains a short-lived ticket, sends the current index with each standard roll, and increments its local index before sending. The server verifies the ID, expiry, and exact expected index. The player save transaction includes the ticket's expected old value and next value, so duplicate/out-of-order submissions cannot both commit the same ticket index. The HTTP roll endpoint now rejects submissions that omit the ticket.

This ticket is an ordering/replay guard, not a prediction mechanism and not proof that the client is honest about anything else.

## Remaining limitation

This patch reduces one clear global contention hotspot and improves error diagnostics. It does not measure live concurrent transaction usage and cannot prove every `redis: transaction failed` message has the same cause. New transaction metrics or a captured server stack trace may be needed if failures continue.
