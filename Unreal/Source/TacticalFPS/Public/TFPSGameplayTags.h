#pragma once

#include "NativeGameplayTags.h"

/**
 * Native gameplay tags. Defined in C++ so they exist before any config is loaded,
 * can be referenced without string lookups, and cannot be typo'd in code.
 */
namespace TFPSGameplayTags
{
	// Native input: bound directly to character functions (movement/look never go through GAS).
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Move);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Look);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Jump);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Crouch);

	// Ability input: matched against ability spec source tags.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Weapon_Fire);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Weapon_ADS);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Weapon_Reload);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Movement_Sprint);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Equipment_Lethal);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(InputTag_Equipment_Tactical);

	// Abilities: identify abilities for activation, blocking and cancelling.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Ability_Weapon_Fire);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Ability_Weapon_ADS);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Ability_Weapon_Reload);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Ability_Movement_Sprint);

	// State: loose/owned tags describing what the character is doing right now.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(State_Dead);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(State_Sprinting);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(State_ADS);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(State_Reloading);

	// Gameplay events.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Event_Death);

	// Gameplay cues.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(GameplayCue_Weapon_Fire);

	// SetByCaller magnitudes.
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(SetByCaller_Damage);

	// Match phases (driven by the GameState phase machine).
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Match_Phase_Warmup);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Match_Phase_InProgress);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Match_Phase_RoundEnd);
	TACTICALFPS_API UE_DECLARE_GAMEPLAY_TAG_EXTERN(Match_Phase_PostGame);
}
