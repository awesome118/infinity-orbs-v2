      await txn.multi();
      await txn.set(keyName, JSON.stringify(archive));
      for (let index = 0; index < codexWrites.length; index += 1) {
        await txn.hSet(codexWriteKeys[index], codexWrites[index].fields);
      }
      for (const write of ticketWrites) {
        if (write.expiration) await txn.set(write.key, write.nextValue, { expiration: write.expiration });
        else await txn.set(write.key, write.nextValue);
      }
      const committed = await txn.exec();
      transactionClosed = true;
      if (committed !== null) {
        state.stateRevision = nextRevision;
        state.saveGeneration = 0;
        delete state.riftSelectedBestRarity;
        pendingSaveExtraWrites.delete(state);
        pendingCodexRarityWrites.delete(state);
        pendingSavePostCommitActions.delete(state);
        state.riftSaveContext = 'rift:' + session.runId;
        if (!completed) {
          const activeMutation = getRiftMutationDefinition(run.mutationId);
          const rollsRemaining = activeMutation
            ? Math.max(0, safeNonNegativeInteger(run.mutationEndsAtRoll) - safeNonNegativeInteger(storedState.totalRolls))
            : 0;
          session.riftMutation = activeMutation && rollsRemaining > 0
            ? {
                id: activeMutation.id,
                name: activeMutation.name,
                description: activeMutation.description,
                effect: activeMutation.effect,
                rollsRemaining,
              }
            : null;
          session.riftMutationLuckMultiplier = session.riftMutation ? activeMutation!.luckMultiplier : 1;
          session.riftMutationCooldownMultiplier = session.riftMutation ? activeMutation!.cooldownMultiplier : 1;
          session.riftMutationCoinMultiplier = session.riftMutation ? activeMutation!.coinMultiplier : 1;
        }
        if (completed) {
          state.riftRunComplete = true;
          delete state.riftSession;
          void deleteRiftCodexForRun(session.runId).catch(error => {
            console.error('[Rift Save] Completed challenge Codex cleanup failed:', error);
          });
        }
        return;
      }
    } finally {
      if (!transactionClosed) await txn.unwatch().catch(() => undefined);
    }
  }
  throw new Error('Rift save changed too frequently. Please retry.');
}

export async function loadRaw(options: { registerActivity?: boolean; persistMigrations?: boolean; source?: 'active' | 'main' } = {}): Promise<PlayerState> {