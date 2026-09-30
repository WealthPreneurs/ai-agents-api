#include "Loadout/TFPSLoadoutTypes.h"

void FTFPSWeaponStatModifiers::Combine(const FTFPSWeaponStatModifiers& Other)
{
	DamageMultiplier *= Other.DamageMultiplier;
	RangeMultiplier *= Other.RangeMultiplier;
	FireRateMultiplier *= Other.FireRateMultiplier;
	HipSpreadMultiplier *= Other.HipSpreadMultiplier;
	ADSSpreadMultiplier *= Other.ADSSpreadMultiplier;
	ReloadTimeMultiplier *= Other.ReloadTimeMultiplier;
	EquipTimeMultiplier *= Other.EquipTimeMultiplier;
	ADSTimeMultiplier *= Other.ADSTimeMultiplier;
	MovementSpeedMultiplier *= Other.MovementSpeedMultiplier;
	MagazineSizeDelta += Other.MagazineSizeDelta;
	ReserveAmmoDelta += Other.ReserveAmmoDelta;
}
