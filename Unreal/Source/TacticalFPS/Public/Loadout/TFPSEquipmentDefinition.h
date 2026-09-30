#pragma once

#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutItemDefinition.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSEquipmentDefinition.generated.h"

class UTFPSAbilitySet;

/**
 * Lethal or tactical equipment (frag, flash, semtex...). The throw ability, bound to
 * InputTag.Equipment.Lethal / Tactical, and its charge effect live in AbilitySet.
 */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSEquipmentDefinition : public UTFPSLoadoutItemDefinition
{
	GENERATED_BODY()

public:
	virtual FPrimaryAssetType GetLoadoutItemType() const override { return TFPSLoadoutAssetTypes::Equipment(); }

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Equipment")
	ETFPSEquipmentSlot Slot = ETFPSEquipmentSlot::Lethal;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Equipment")
	TObjectPtr<const UTFPSAbilitySet> AbilitySet;
};
