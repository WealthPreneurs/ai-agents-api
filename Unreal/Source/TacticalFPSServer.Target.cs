using UnrealBuildTool;

// Dedicated server target. Requires a source build of the engine.
public class TacticalFPSServerTarget : TargetRules
{
	public TacticalFPSServerTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Server;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("TacticalFPS");

		// Keep server logs in Shipping so match/anti-cheat issues can be diagnosed in production.
		bUseLoggingInShipping = true;
	}
}
