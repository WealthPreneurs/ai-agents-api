# TacticalFPS (Unreal Engine 5)

A dedicated-server-authoritative FPS framework built on the Gameplay Ability System (GAS). It targets UE 5.5 or later, because it uses `GetDynamicSpecSourceTags` and `SetNetUpdateFrequency`.

## Layout

```
Unreal/
  TacticalFPS.uproject
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
5. **Game mode.** Use a game mode with Player Controller = `TFPSPlayerController`, Player State = `TFPSPlayerState` and the character Blueprint as the default pawn. The match-lifecycle game mode will replace it later.

## Networking model

- The ASC lives on the PlayerState, with the avatar set to the pawn.
- Mixed replication mode: the owning client gets full effect data, while simulated proxies get only tags and cues.
- Abilities activate from input tags with local prediction. The server re-validates every activation.
- Damage flows through the `IncomingDamage` meta attribute. It is resolved server-side in `PostGameplayEffectExecute`, where armor absorbs damage first.
- `OnOutOfHealth` fires once, on the server only.
- Armor replicates `COND_OwnerOnly`, so enemies never receive it.
- The character is only the ASC's avatar. The server initializes the ASC in `PossessedBy` and every client does so in `OnRep_PlayerState`. Abilities are granted on the server only and revoked on unpossess.
- Movement uses the stock CharacterMovementComponent: the client predicts, the server replays each move and corrects the client when they disagree.
- Death is a push-model replicated `bIsDead` flag on the pawn, which drives ragdoll and other visuals on every machine. It also sets a replicated `State.Dead` tag on the ASC, which blocks abilities.
