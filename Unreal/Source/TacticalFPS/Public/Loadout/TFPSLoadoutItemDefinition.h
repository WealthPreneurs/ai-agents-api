#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "TFPSLoadoutItemDefinition.generated.h"

class UTexture2D;

/** Primary asset types for loadout items. Must match AssetManager scan rules in Config/DefaultGame.ini. */
namespace TFPSLoadoutAssetTypes
{
	TACTICALFPS_API const FPrimaryAssetType& Weapon();
	TACTICALFPS_API const FPrimaryAssetType& Attachment();
	TACTICALFPS_API const FPrimaryAssetType& Perk();
	TACTICALFPS_API const FPrimaryAssetType& Equipment();
}

/**
 * Base for anything selectable in a loadout. Clients reference items only by FPrimaryAssetId; the server
 * resolves IDs through the AssetManager registry, so an ID that isn't a registered item of the expected
 * type resolves to nothing. A client can never make the server load an arbitrary path.
 */
UCLASS(Abstract, BlueprintType, Const)
class TACTICALFPS_API UTFPSLoadoutItemDefinition : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	//~UPrimaryDataAsset
	virtual FPrimaryAssetId GetPrimaryAssetId() const override;
	//~End UPrimaryDataAsset

	/** Asset type this class registers under. Subclasses must override. */
	virtual FPrimaryAssetType GetLoadoutItemType() const { return FPrimaryAssetType(); }

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loadout")
	FText DisplayName;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loadout")
	TSoftObjectPtr<UTexture2D> Icon;

	/** Player level required. Checked on the server against the backend-provided level. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Loadout", Meta = (ClampMin = 0))
	int32 UnlockLevel = 0;
};
