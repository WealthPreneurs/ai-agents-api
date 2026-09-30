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
	MagazineSizeDelta += Other.MagazineSizeDelta;
	ReserveAmmoDelta += Other.ReserveAmmoDelta;
}
