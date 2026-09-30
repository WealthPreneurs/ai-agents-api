#include "Weapons/TFPSWeaponDefinition.h"

FTFPSWeaponStats UTFPSWeaponDefinition::BuildStats(const FTFPSWeaponStatModifiers& Modifiers) const
{
	FTFPSWeaponStats Stats;

	Stats.FireMode = FireMode;
	Stats.FireInterval = FMath::Max(60.f / FMath::Max(RoundsPerMinute * Modifiers.FireRateMultiplier, 1.f), 0.03f);
	Stats.BurstCount = FMath::Max(BurstCount, 2);
	Stats.BurstCooldown = FMath::Max(BurstCooldown, 0.f);
	Stats.PelletsPerShot = FMath::Clamp(PelletsPerShot, 1, 16);

	Stats.MaxRange = FMath::Max(MaxRange * Modifiers.RangeMultiplier, 100.f);
	Stats.FalloffStartRange = FMath::Max(FalloffStartRange * Modifiers.RangeMultiplier, 0.f);
	Stats.FalloffEndRange = FMath::Max(FalloffEndRange * Modifiers.RangeMultiplier, Stats.FalloffStartRange);

	Stats.HipSpreadAngle = FMath::Max(HipSpreadAngle * Modifiers.HipSpreadMultiplier, 0.f);
	Stats.ADSSpreadAngle = FMath::Max(ADSSpreadAngle * Modifiers.ADSSpreadMultiplier, 0.f);

	Stats.MagazineSize = FMath::Max(MagazineSize + Modifiers.MagazineSizeDelta, 1);
	Stats.MaxReserveAmmo = FMath::Max(MaxReserveAmmo + Modifiers.ReserveAmmoDelta, 0);

	Stats.BaseDamage = FMath::Max(BaseDamage * Modifiers.DamageMultiplier, 0.f);
	Stats.MinDamageMultiplier = MinDamageMultiplier;

	Stats.ReloadTime = FMath::Max(ReloadTime * Modifiers.ReloadTimeMultiplier, 0.f);
	Stats.EquipTime = FMath::Max(EquipTime * Modifiers.EquipTimeMultiplier, 0.f);
	Stats.ADSTime = FMath::Max(ADSTime * Modifiers.ADSTimeMultiplier, 0.f);
	Stats.MovementSpeedMultiplier = FMath::Clamp(MovementSpeedMultiplier * Modifiers.MovementSpeedMultiplier, 0.1f, 1.5f);
	Stats.ADSMovementSpeedMultiplier = FMath::Clamp(ADSMovementSpeedMultiplier, 0.1f, 1.f);

	return Stats;
}

float UTFPSWeaponDefinition::CalculateDamage(const FTFPSWeaponStats& Stats, float Distance, FName HitBone) const
{
	float RangeMultiplier = 1.f;
	if (Distance > Stats.FalloffStartRange)
	{
		const float FalloffSpan = FMath::Max(Stats.FalloffEndRange - Stats.FalloffStartRange, KINDA_SMALL_NUMBER);
		const float Alpha = FMath::Clamp((Distance - Stats.FalloffStartRange) / FalloffSpan, 0.f, 1.f);
		RangeMultiplier = FMath::Lerp(1.f, Stats.MinDamageMultiplier, Alpha);
	}

	const float* BoneMultiplier = BoneDamageMultipliers.Find(HitBone);
	return Stats.BaseDamage * RangeMultiplier * (BoneMultiplier ? *BoneMultiplier : 1.f);
}
