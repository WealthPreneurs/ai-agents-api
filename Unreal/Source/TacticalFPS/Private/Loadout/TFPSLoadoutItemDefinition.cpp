#include "Loadout/TFPSLoadoutItemDefinition.h"

namespace TFPSLoadoutAssetTypes
{
	const FPrimaryAssetType& Weapon()
	{
		static const FPrimaryAssetType Type(TEXT("TFPSWeapon"));
		return Type;
	}

	const FPrimaryAssetType& Attachment()
	{
		static const FPrimaryAssetType Type(TEXT("TFPSAttachment"));
		return Type;
	}

	const FPrimaryAssetType& Perk()
	{
		static const FPrimaryAssetType Type(TEXT("TFPSPerk"));
		return Type;
	}

	const FPrimaryAssetType& Equipment()
	{
		static const FPrimaryAssetType Type(TEXT("TFPSEquipment"));
		return Type;
	}
}

FPrimaryAssetId UTFPSLoadoutItemDefinition::GetPrimaryAssetId() const
{
	if (HasAnyFlags(RF_ClassDefaultObject))
	{
		return FPrimaryAssetId();
	}

	return FPrimaryAssetId(GetLoadoutItemType(), GetFName());
}
