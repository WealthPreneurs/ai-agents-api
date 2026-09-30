# TacticalFPS (Unreal Engine 5)

A dedicated-server-authoritative FPS framework built on the Gameplay Ability System (GAS). It targets UE 5.5 or later, because it uses `GetDynamicSpecSourceTags` and `SetNetUpdateFrequency`.

## Layout

```
Unreal/
  TacticalFPS.uproject
  Config/                            Weapon trace channel, asset manager scan rules
  Source/
    TacticalFPS.Target.cs          Game (client + listen server)
    TacticalFPSEditor.Target.cs    Editor
    TacticalFPSServer.Target.cs    Dedicated server (needs a source-built engine)
    TacticalFPS/
      TacticalFPS.Build.cs
      Public/  Private/
        TacticalFPS.*                          module + LogTFPS
        TFPSGameplayTags.*                     native tags (input, abilities, state, events, match phases)
        AbilitySystem/TFPSAbilitySystemComponent.*   input-tag routing, predicted activation
        AbilitySystem/TFPSAbilitySet.*               data asset: abilities + effects granted/revoked as a unit
        AbilitySystem/TFPSShotTargetData.*           compact client->server shot payload (custom NetSerialize)
        AbilitySystem/Abilities/TFPSGameplayAbility*  base ability + predicted hitscan fire
        Weapons/TFPSWeaponDefinition.*         data asset: fire mode, RPM, ammo, damage falloff, hit zones
        Weapons/TFPSWeaponComponent.*          equipped weapon, predicted ammo, fire-rate limiting, cosmetics
        LagCompensation/TFPSLagCompensationSubsystem.*  server-side hitbox history + rewind hit confirmation
        Game/TFPSGameMode.*                    phase machine, teams, spawn selection, respawn, scoring, map rotation
        Game/TFPSGameState.*                   replicated phase, countdown, team scores, kill feed
        Teams/TFPSTeamAgentInterface.*         team identity (PlayerState is the source of truth)
        TFPSCollisionChannels.h                Weapon trace channel (see Config/DefaultEngine.ini)
        AbilitySystem/Attributes/TFPSHealthSet.*     health/armor with a server-side damage choke point
        Player/TFPSPlayerState.*               ASC owner (Mixed replication)
        Player/TFPSPlayerController.*          drains ASC input once per frame
        Character/TFPSCharacter.*              first-person pawn, ASC avatar, death flow
        Input/TFPSInputConfig.*                data asset: InputAction -> InputTag
```

## Opening it

1. Right-click `TacticalFPS.uproject` and choose **Generate Visual Studio project files**, or run `GenerateProjectFiles`.
2. Build `TacticalFPSEditor` (Development Editor).
3. For a dedicated server, build `TacticalFPSServer` against a source-built engine.

To drop the module into an existing project instead, copy `Source/TacticalFPS` into it. Then add the module to your `.uproject` and enable the `GameplayAbilities` plugin.

## Editor setup

1. **Input.** Create Input Actions for Move and Look (Axis2D), plus Jump, Crouch, Fire, ADS, Reload and Sprint. Put them in an Input Mapping Context.
2. **Input config.** Create a `TFPSInputConfig` data asset.
   - Under *Native Input Actions*, map the actions to `InputTag.Move`, `InputTag.Look`, `InputTag.Jump` and `InputTag.Crouch`.
   - Under *Ability Input Actions*, map the rest to `InputTag.Weapon.*` and `InputTag.Movement.Sprint`.
3. **Ability set.** Create a `TFPSAbilitySet` data asset.
   - Add the base abilities, each with its input tag.
   - Add an instant *attribute reset* effect that overrides Health to MaxHealth. It runs on every spawn, which is how respawns come back at full health.
4. **Character Blueprint.** Create one from `TFPSCharacter`. Assign the meshes, the input config, the mapping context and the default ability set.
5. **Damage effect.** Create an instant Gameplay Effect with one modifier: `TFPSHealthSet.IncomingDamage`, Add, magnitude from SetByCaller `SetByCaller.Damage`.
6. **Weapon.** Create a `TFPSWeaponDefinition` under `/Game/Weapons`.
   - Fill in fire mode, rate of fire, ammo and damage.
   - Add bone multipliers, e.g. `head` = 1.5.
   - Set the damage effect.
   - Give it an ability set containing `TFPSGameplayAbility_Fire` (or a Blueprint child) on `InputTag.Weapon.Fire`.
   - On the character Blueprint's *Weapon Component*, set it as *Default Weapon*.
7. **Fire cue.** Create a `GameplayCueNotify_Static` for `GameplayCue.Weapon.Fire`. `Location` and `Normal` are the impact, `EffectCauser` is the shooter and `SourceObject` is the weapon definition.
8. **Game mode.** Create a Blueprint of `TFPSGameMode`, set *Default Pawn Class* to the character Blueprint, and use it as the map's (or the project's) game mode. Controller, player state and game state are already set.
9. **Spawns.** Place Player Starts. Set *Player Start Tag* to `Team0` or `Team1` for team-only spawns; untagged starts are shared.

## Networking model

- The ASC lives on the PlayerState, with the avatar set to the pawn.
- Mixed replication mode: the owning client gets full effect data, while simulated proxies get only tags and cues.
- Abilities activate from input tags with local prediction. The server re-validates every activation.
- Damage flows through the `IncomingDamage` meta attribute. It is resolved server-side in `PostGameplayEffectExecute`, where armor absorbs damage first.
- `OnOutOfHealth` fires once, on the server only.
- Armor replicates `COND_OwnerOnly`, so enemies never receive it.
- The character is only the ASC's avatar. The server initializes the ASC in `PossessedBy` and every client does so in `OnRep_PlayerState`. Abilities are granted on the server only and revoked on unpossess.
- Movement uses the stock CharacterMovementComponent: the client predicts, the server replays each move and corrects the client when they disagree.
- Firing is predicted on the client and validated on the server; see the header of `TFPSGameplayAbility_Fire.h` for the full flow.
  - The client traces and sends one compact shot packet per shot. The server rate-limits shots, sanity-checks each shot and hit, spends ammo, and computes and applies damage.
  - Ammo prediction uses shot sequence numbers, the way CharacterMovement reconciles saved moves.
  - Hits are confirmed with server-side rewind (next section).

## Lag compensation

Every frame, the server records each character's hitbox capsules from its physics asset. It interpolates those recorded poses to the moment the shooter was seeing, and re-tests the client's ray against them.

- The server picks the bone, so headshots can't be forged.
- Nothing is actually moved during rewind. The test is pure math on recorded data, so it can't disturb physics.
- **Rewind time** = server now − the shooter's measured ping − `SimulatedProxyViewDelay`, capped at `MaxLagCompensationTime` (0.35 s).
  - It uses the ping the server measures, not a timestamp from the client, so a client can't forge how far back it gets.
- Hitboxes must be capsules or spheres in the physics asset; boxes and convex shapes are ignored with a warning.
- Every character skin must share the default skeleton and physics asset, because the server only uses the default body mesh.
- Targets without history, such as a turret with no physics asset, fall back to the older plausibility check.
- **Tuning** (server console variables):
  - `tfps.LagComp.HistorySeconds` (default 0.5)
  - `tfps.LagComp.HitboxInflation` (default 2 cm)
  - `tfps.LagComp.JitterWindow` (default 16 ms)
- Death is a push-model replicated `bIsDead` flag on the pawn, which drives ragdoll and other visuals on every machine. It also sets a replicated `State.Dead` tag on the ASC, which blocks abilities.

## Match lifecycle

`ATFPSGameMode` runs on the server; `ATFPSGameState` replicates what clients need to see.

```
Warmup ──(timer, enough players)──> InProgress ──(score limit or time)──> RoundEnd
  ^  └──(not enough players: extend)                ^                      │
  │                                                  └──(more rounds)──────┤
next map <──(timer)── PostGame <──────────────(match decided)──────────────┘
```

- **The phase machine** is timer-driven, with no tick. Every transition writes the phase tag and the end time to the game state, which forces a net update so countdowns start in sync. Clients compute the time left from the server clock.
- **Spawning** happens only in Warmup and InProgress; players who join later spectate until the next round.
  - New players join the smallest team.
  - Spawn points tagged for another team are skipped, and so are points within 150 cm of a living player.
  - Among the rest, the game mode picks the point farthest from enemies, with some randomness so equally safe spawns rotate.
- **Scoring** counts only in InProgress. Enemy kills add to the killer's team score; team kills and suicides only count as deaths. Reaching the score limit ends the round immediately.
- **Kill feed** is an unreliable multicast from the game state. Scores replicate separately, so a dropped entry costs nothing.
- **Freezing** happens in RoundEnd and PostGame: pawns stop moving and get a `State.Frozen` tag, which blocks every ability. The health set also rejects all damage outside active phases, and rejects friendly fire unless it's enabled.
- **Rounds:** each new round respawns everyone with fresh pawns.
- **Travel** is seamless. PlayerStates keep their team across maps, and stats reset each map. `MapRotation` advances through a `?RotationIndex=` URL option.
- **Settings** are in `Config/DefaultGame.ini`, and several can be overridden per match through the server URL.

