#include "AbilitySystem/Attributes/TFPSHealthSet.h"

#include "GameplayEffect.h"
#include "GameplayEffectExtension.h"
#include "Net/UnrealNetwork.h"

UTFPSHealthSet::UTFPSHealthSet()
	: Health(100.f)
	, MaxHealth(100.f)
	, Armor(0.f)
	, MaxArmor(150.f)
	, IncomingDamage(0.f)
{
}

void UTFPSHealthSet::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	// REPNOTIFY_Always: the client may have predicted the same value, and GAS still needs the notify
	// to reconcile its local aggregator with the server's.
	DOREPLIFETIME_CONDITION_NOTIFY(UTFPSHealthSet, Health, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME_CONDITION_NOTIFY(UTFPSHealthSet, MaxHealth, COND_None, REPNOTIFY_Always);
	DOREPLIFETIME_CONDITION_NOTIFY(UTFPSHealthSet, Armor, COND_OwnerOnly, REPNOTIFY_Always);
	DOREPLIFETIME_CONDITION_NOTIFY(UTFPSHealthSet, MaxArmor, COND_OwnerOnly, REPNOTIFY_Always);
}

void UTFPSHealthSet::OnRep_Health(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UTFPSHealthSet, Health, OldValue);
}

void UTFPSHealthSet::OnRep_MaxHealth(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UTFPSHealthSet, MaxHealth, OldValue);
}

void UTFPSHealthSet::OnRep_Armor(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UTFPSHealthSet, Armor, OldValue);
}

void UTFPSHealthSet::OnRep_MaxArmor(const FGameplayAttributeData& OldValue)
{
	GAMEPLAYATTRIBUTE_REPNOTIFY(UTFPSHealthSet, MaxArmor, OldValue);
}

void UTFPSHealthSet::PreAttributeBaseChange(const FGameplayAttribute& Attribute, float& NewValue) const
{
	Super::PreAttributeBaseChange(Attribute, NewValue);
	ClampAttribute(Attribute, NewValue);
}

void UTFPSHealthSet::PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue)
{
	Super::PreAttributeChange(Attribute, NewValue);
	ClampAttribute(Attribute, NewValue);
}

void UTFPSHealthSet::PostAttributeChange(const FGameplayAttribute& Attribute, float OldValue, float NewValue)
{
	Super::PostAttributeChange(Attribute, OldValue, NewValue);

	UAbilitySystemComponent* ASC = GetOwningAbilitySystemComponent();
	if (!ASC)
	{
		return;
	}

	// If a max drops (e.g. a perk is removed), pull the current value down with it. Authority only:
	// clients receive the corrected value through replication.
	if (ASC->IsOwnerActorAuthoritative())
	{
		if (Attribute == GetMaxHealthAttribute() && GetHealth() > NewValue)
		{
			ASC->ApplyModToAttribute(GetHealthAttribute(), EGameplayModOp::Override, NewValue);
		}
		else if (Attribute == GetMaxArmorAttribute() && GetArmor() > NewValue)
		{
			ASC->ApplyModToAttribute(GetArmorAttribute(), EGameplayModOp::Override, NewValue);
		}
	}

	// Respawn / revive restores health: re-arm the death event.
	if (Attribute == GetHealthAttribute() && NewValue > 0.f)
	{
		bOutOfHealth = false;
	}
}

bool UTFPSHealthSet::PreGameplayEffectExecute(FGameplayEffectModCallbackData& Data)
{
	if (!Super::PreGameplayEffectExecute(Data))
	{
		return false;
	}

	// Dead targets take no further damage (prevents double kill credit / negative-health feed spam).
	if (Data.EvaluatedData.Attribute == GetIncomingDamageAttribute() && bOutOfHealth)
	{
		Data.EvaluatedData.Magnitude = 0.f;
	}

	return true;
}

void UTFPSHealthSet::PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data)
{
	Super::PostGameplayEffectExecute(Data);

	float DamageDone = 0.f;

	if (Data.EvaluatedData.Attribute == GetIncomingDamageAttribute())
	{
		DamageDone = FMath::Max(GetIncomingDamage(), 0.f);
		SetIncomingDamage(0.f);

		if (DamageDone > 0.f)
		{
			// Armor absorbs first, remainder goes to health.
			const float Absorbed = FMath::Min(GetArmor(), DamageDone);
			SetArmor(GetArmor() - Absorbed);
			SetHealth(FMath::Clamp(GetHealth() - (DamageDone - Absorbed), 0.f, GetMaxHealth()));
		}
	}
	else if (Data.EvaluatedData.Attribute == GetHealthAttribute())
	{
		SetHealth(FMath::Clamp(GetHealth(), 0.f, GetMaxHealth()));
	}
	else if (Data.EvaluatedData.Attribute == GetArmorAttribute())
	{
		SetArmor(FMath::Clamp(GetArmor(), 0.f, GetMaxArmor()));
	}

	if (GetHealth() <= 0.f && !bOutOfHealth)
	{
		bOutOfHealth = true;

		const UAbilitySystemComponent* ASC = GetOwningAbilitySystemComponent();
		if (ASC && ASC->IsOwnerActorAuthoritative())
		{
			const FGameplayEffectContextHandle& Context = Data.EffectSpec.GetContext();
			OnOutOfHealth.Broadcast(Context.GetOriginalInstigator(), Context.GetEffectCauser(), &Data.EffectSpec, DamageDone);
		}
	}
}

void UTFPSHealthSet::ClampAttribute(const FGameplayAttribute& Attribute, float& NewValue) const
{
	if (Attribute == GetHealthAttribute())
	{
		NewValue = FMath::Clamp(NewValue, 0.f, GetMaxHealth());
	}
	else if (Attribute == GetMaxHealthAttribute())
	{
		NewValue = FMath::Max(NewValue, 1.f);
	}
	else if (Attribute == GetArmorAttribute())
	{
		NewValue = FMath::Clamp(NewValue, 0.f, GetMaxArmor());
	}
	else if (Attribute == GetMaxArmorAttribute())
	{
		NewValue = FMath::Max(NewValue, 0.f);
	}
}
