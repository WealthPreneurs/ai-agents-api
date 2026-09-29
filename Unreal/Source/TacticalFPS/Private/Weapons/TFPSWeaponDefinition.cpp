#include "Weapons/TFPSWeaponDefinition.h"

FPrimaryAssetId UTFPSWeaponDefinition::GetPrimaryAssetId() const
{
	static const FPrimaryAssetType WeaponType(TEXT("TFPSWeapon"));
	return FPrimaryAssetId(WeaponType, GetFName());
}

float UTFPSWeaponDefinition::CalculateDamage(float Distance, FName HitBone) const
{
	float RangeMultiplier = 1.f;
	if (Distance > FalloffStartRange)
	{
		const float FalloffSpan = FMath::Max(FalloffEndRange - FalloffStartRange, KINDA_SMALL_NUMBER);
		const float Alpha = FMath::Clamp((Distance - FalloffStartRange) / FalloffSpan, 0.f, 1.f);
		RangeMultiplier = FMath::Lerp(1.f, MinDamageMultiplier, Alpha);
	}

	const float* BoneMultiplier = BoneDamageMultipliers.Find(HitBone);
	return BaseDamage * RangeMultiplier * (BoneMultiplier ? *BoneMultiplier : 1.f);
}
