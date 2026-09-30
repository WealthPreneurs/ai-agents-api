#pragma once

#include "CoreMinimal.h"
#include "Loadout/TFPSLoadoutItemDefinition.h"
#include "Loadout/TFPSLoadoutTypes.h"

#include "TFPSAttachmentDefinition.generated.h"

class UStaticMesh;

/** A weapon attachment: stat modifiers plus a cosmetic mesh. Allowed per weapon via AllowedAttachments. */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSAttachmentDefinition : public UTFPSLoadoutItemDefinition
{
	GENERATED_BODY()

public:
	virtual FPrimaryAssetType GetLoadoutItemType() const override { return TFPSLoadoutAssetTypes::Attachment(); }

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Attachment")
	ETFPSAttachmentSlot Slot = ETFPSAttachmentSlot::Optic;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Attachment")
	FTFPSWeaponStatModifiers Modifiers;

	/** Client only, async loaded with the weapon. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Cosmetics")
	TSoftObjectPtr<UStaticMesh> Mesh;

	/** Socket on the weapon mesh (both 1P and 3P weapon meshes must have it). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Cosmetics")
	FName AttachSocket;
};
