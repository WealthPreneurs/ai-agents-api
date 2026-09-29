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
        AbilitySystem/Attributes/TFPSHealthSet.*     health/armor with a server-side damage choke point
        Player/TFPSPlayerState.*               ASC owner (Mixed replication)
```

## Opening it

1. Right-click `TacticalFPS.uproject` and choose **Generate Visual Studio project files**, or run `GenerateProjectFiles`.
2. Build `TacticalFPSEditor` (Development Editor).
3. For a dedicated server, build `TacticalFPSServer` against a source-built engine.

To drop the module into an existing project instead, copy `Source/TacticalFPS` into it. Then add the module to your `.uproject` and enable the `GameplayAbilities` plugin.

## Networking model

- The ASC lives on the PlayerState, with the avatar set to the pawn.
- Mixed replication mode: the owning client gets full effect data, while simulated proxies get only tags and cues.
- Abilities activate from input tags with local prediction. The server re-validates every activation.
- Damage flows through the `IncomingDamage` meta attribute. It is resolved server-side in `PostGameplayEffectExecute`, where armor absorbs damage first.
- `OnOutOfHealth` fires once, on the server only.
- Armor replicates `COND_OwnerOnly`, so enemies never receive it.
