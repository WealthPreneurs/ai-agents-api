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
        Weapons/TFPSWeaponDefinition.*         data asset: base stats, allowed attachments, slot type, hit zones
        Weapons/TFPSWeaponComponent.*          weapon slots, per-player stats, predicted ammo + swaps, fire-rate/equip-time limits, cosmetics
        Loadout/TFPSLoadoutTypes.*             stat modifiers, effective stats, loadout request (IDs) / resolved loadout
        Loadout/TFPSLoadoutItemDefinition.*    base for loadout items (display name, icon, unlock level, asset type)
        Loadout/TFPSAttachmentDefinition.h     attachment: slot, stat modifiers, mesh + socket
        Loadout/TFPSPerkDefinition.h           perk: slot, ability set, weapon stat modifiers
        Loadout/TFPSEquipmentDefinition.h      lethal/tactical: slot, ability set
        Loadout/TFPSLoadoutComponent.*         on PlayerState: request RPC, server validation, active loadout
        AbilitySystem/Abilities/TFPSWeaponGameplayAbility.*   weapon abilities gated on the active weapon
        AbilitySystem/Abilities/TFPSGameplayAbility_SwitchWeapon.*  predicted weapon swap
        AbilitySystem/Abilities/TFPSGameplayAbility_Reload.*  predicted, server-timed reload
        AbilitySystem/Abilities/TFPSGameplayAbility_ADS.*     aim down sights (hold/toggle)
        AbilitySystem/Abilities/TFPSGameplayAbility_Sprint.*  sprint (toggle/hold)
        AbilitySystem/Attributes/TFPSMovementSet.*   movement speed multiplier (perks, status effects)
        Movement/TFPSCharacterMovementComponent.*   predicted sprint / ADS speed via saved-move flags
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
6. **Loadout items.** Create them as data assets under `/Game/Loadout/{Weapons,Attachments,Perks,Equipment}`. They are only recognized in those folders.
   - **Weapons** (`TFPSWeaponDefinition`): set the slot type, allowed attachments, the attachment cap, stats, handling (reload, equip and ADS time, movement multipliers), bone multipliers (e.g. `head` = 1.5) and the damage effect. Give each weapon an ability set with these abilities:
     - `TFPSGameplayAbility_Fire` on `InputTag.Weapon.Fire`
     - `TFPSGameplayAbility_ADS` on `InputTag.Weapon.ADS`
     - `TFPSGameplayAbility_Reload` on `InputTag.Weapon.Reload`

     Use Blueprint children of these for montages and FOV.
   - **Attachments** (`TFPSAttachmentDefinition`): set the attachment slot, stat modifiers, mesh and weapon socket.
   - **Perks** (`TFPSPerkDefinition`): set the perk slot, an ability set for passive or active effects, and weapon stat modifiers.
   - **Equipment** (`TFPSEquipmentDefinition`): set Lethal or Tactical, and an ability set with the throw ability on `InputTag.Equipment.*`.
   - Put these in the character's default ability set:
     - `TFPSGameplayAbility_SwitchWeapon` on `InputTag.Weapon.Switch`
     - `TFPSGameplayAbility_Sprint` on `InputTag.Movement.Sprint`
   - Point `DefaultLoadout` in `Config/DefaultGame.ini` at your asset names.
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

## Loadouts and perks

```
client menu ──RequestLoadout(IDs)──> server: resolve through AssetManager ─> validate ─> fill from defaults
                                                                                      │
             <──ActiveLoadout (owner only)── PlayerState.LoadoutComponent <───────────┘
                                                        │ next spawn, or now if within 5 s of spawning
                                                        v
            character: grant perk and equipment ability sets, then equip weapons with
                       stats = base x attachments x perks
```

- **What the client sends:** only `FPrimaryAssetId`s. The server resolves each one through the AssetManager registry, so only registered items of the expected type ever resolve.
- **Validation:**
  - Weapons must match their slot type, and every item must be unlocked.
  - Attachments must be in the weapon's `AllowedAttachments` list, with one per attachment slot and no more than `MaxAttachments`.
  - Perks are limited to one per perk slot, and equipment must match its slot.
  - Invalid pieces are dropped, or replaced from `DefaultLoadout` for weapons.
  - The unlock level comes from `ATFPSGameMode::GetUnlockLevel`. Hook that up to your backend; never trust anything the client sends for it.
- **Stats:** the server builds each weapon's stats from the weapon definition, its attachments and the player's perks. They're sent to the owner only, so client prediction and server validation use identical numbers.
- **Weapon abilities:** every weapon's abilities are granted at spawn. `UTFPSWeaponGameplayAbility` lets them activate only while their own weapon is the active one, so a weapon swap never waits on the server to grant anything.
- **Weapon swap:** predicted on the client, with rollback if the server rejects it. The weapon component enforces equip time on the server, so skipping the swap animation client-side gives no advantage.
- **Performance:** all loadout items are preloaded on the server at `InitGame`, gameplay data only. Cosmetic meshes stay as soft references and load only on clients.

## Sprint, ADS and reload

- **Sprint and ADS speed** live in `UTFPSCharacterMovementComponent`, not in effects. The abilities set "wants to sprint" and "wants to aim" on the owning client, and those intents travel inside every saved move as compressed flags. The server replays each move at the same speed, so there are no corrections and no extra RPCs.
  - Sprint speed applies only on the ground, uncrouched, not aiming and moving forward. Client and server evaluate this identically, so a forged sprint flag gains nothing.
  - Max speed = base × `TFPSMovementSet.MovementSpeedMultiplier` × the held weapon's multiplier × the ADS multiplier while aiming × the sprint multiplier while sprinting.
  - Simulated proxies get sprinting and aiming as a two-bit, push-model, simulated-only property. Animation Blueprints use `IsSprintingForAnimation` and `IsAimingForAnimation`.
- **ADS** adds `State.ADS`, which switches firing to ADS spread and applies the ADS move-speed penalty. It's hold-to-aim by default (`bToggle` makes it toggle). Blueprint events receive the weapon's aim time (`ADSTime`) for the camera blend.
- **Sprint** is press-to-toggle by default. It ends on a second press, or 0.3 s after the player stops being able to sprint. Firing and ADS cancel it, and sprinting cancels ADS.
- **Reload:**
  - The client plays the reload, predicts the refilled magazine when it finishes, and signals the server.
  - The server moves ammo only once `ReloadTimeTolerance` × reload time has passed on its own clock since its activation. Latency cancels out, and a sped-up reload gains nothing.
  - A server reload counter tells the client when the predicted refill has landed, and shots fired after the predicted reload come out of the predicted magazine.
  - Firing with rounds still in the magazine cancels a reload, and firing until empty auto-reloads.

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

