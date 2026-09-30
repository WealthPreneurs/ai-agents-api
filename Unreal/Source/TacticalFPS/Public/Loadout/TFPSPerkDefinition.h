#pragma once

#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutItemDefinition.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSPerkDefinition.generated.h"

class UTFPSAbilitySet;

/**
 * A perk. Anything a perk does is expressed through GAS or stat modifiers:
 *  - Passive stat/tag effects (e.g. Ghost: infinite GE granting Perk.Ghost; Tracker: a cue) -> AbilitySet effects.
 *  - Active perks / field upgrades (with an input tag)                                    -> AbilitySet abilities.
 *  - Weapon handling (e.g. Fast Hands, Stopping Power)                                     -> WeaponModifiers, applied
 *    to every weapon in the loadout when stats are built on the server.
 * Granted on spawn, revoked on death, like the rest of the loadout.
 */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSPerkDefinition : public UTFPSLoadoutItemDefinition
{
	GENERATED_BODY()

public:
	virtual FPrimaryAssetType GetLoadoutItemType() const override { return TFPSLoadoutAssetTypes::Perk(); }

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Perk")
	ETFPSPerkSlot Slot = ETFPSPerkSlot::Perk1;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Perk")
	TObjectPtr<const UTFPSAbilitySet> AbilitySet;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Perk")
	FTFPSWeaponStatModifiers WeaponModifiers;
};
