#include "TFPSGameplayTags.h"

namespace TFPSGameplayTags
{
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Move, "InputTag.Move", "Move input (Vector2D).");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Look, "InputTag.Look", "Look input (Vector2D).");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Jump, "InputTag.Jump", "Jump input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Crouch, "InputTag.Crouch", "Crouch input (hold).");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Weapon_Fire, "InputTag.Weapon.Fire", "Primary fire input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Weapon_ADS, "InputTag.Weapon.ADS", "Aim down sights input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Weapon_Reload, "InputTag.Weapon.Reload", "Reload input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Movement_Sprint, "InputTag.Movement.Sprint", "Sprint input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Equipment_Lethal, "InputTag.Equipment.Lethal", "Lethal equipment input.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(InputTag_Equipment_Tactical, "InputTag.Equipment.Tactical", "Tactical equipment input.");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Ability_Weapon_Fire, "Ability.Weapon.Fire", "Weapon fire ability.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Ability_Weapon_ADS, "Ability.Weapon.ADS", "Aim down sights ability.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Ability_Weapon_Reload, "Ability.Weapon.Reload", "Reload ability.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Ability_Movement_Sprint, "Ability.Movement.Sprint", "Sprint ability.");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(State_Dead, "State.Dead", "Owner is dead; blocks all abilities.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(State_Sprinting, "State.Sprinting", "Owner is sprinting; blocks firing.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(State_ADS, "State.ADS", "Owner is aiming down sights.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(State_Reloading, "State.Reloading", "Owner is reloading.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(State_Frozen, "State.Frozen", "Match phase forbids acting (round end, post game).");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Event_Death, "Event.Death", "Sent to the owner's ASC when health reaches zero.");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(GameplayCue_Weapon_Fire, "GameplayCue.Weapon.Fire", "Muzzle flash, tracer and impact for one shot.");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(SetByCaller_Damage, "SetByCaller.Damage", "Damage magnitude computed server-side.");

	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Match_Phase_Warmup, "Match.Phase.Warmup", "Pre-match warmup.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Match_Phase_InProgress, "Match.Phase.InProgress", "Live round.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Match_Phase_RoundEnd, "Match.Phase.RoundEnd", "Between rounds.");
	UE_DEFINE_GAMEPLAY_TAG_COMMENT(Match_Phase_PostGame, "Match.Phase.PostGame", "Scoreboard / results.");
}
