#include "AbilitySystem/TFPSAbilitySet.h"

#include "AbilitySystemComponent.h"
#include "Abilities/GameplayAbility.h"
#include "GameplayEffect.h"
#include "TacticalFPS.h"

void FTFPSAbilitySet_GrantedHandles::AddAbilitySpecHandle(const FGameplayAbilitySpecHandle& Handle)
{
	if (Handle.IsValid())
	{
		AbilitySpecHandles.Add(Handle);
	}
}

void FTFPSAbilitySet_GrantedHandles::AddGameplayEffectHandle(const FActiveGameplayEffectHandle& Handle)
{
	if (Handle.IsValid())
	{
		GameplayEffectHandles.Add(Handle);
	}
}

void FTFPSAbilitySet_GrantedHandles::TakeFromAbilitySystem(UAbilitySystemComponent* ASC)
{
	if (!ASC || !ASC->IsOwnerActorAuthoritative())
	{
		return;
	}

	for (const FGameplayAbilitySpecHandle& Handle : AbilitySpecHandles)
	{
		// ClearAbility cancels the ability first if it is running.
		ASC->ClearAbility(Handle);
	}

	for (const FActiveGameplayEffectHandle& Handle : GameplayEffectHandles)
	{
		ASC->RemoveActiveGameplayEffect(Handle);
	}

	AbilitySpecHandles.Reset();
	GameplayEffectHandles.Reset();
}

void UTFPSAbilitySet::GiveToAbilitySystem(UAbilitySystemComponent* ASC, FTFPSAbilitySet_GrantedHandles* OutGrantedHandles, UObject* SourceObject) const
{
	check(ASC);

	// Never grant on a client. Anything granted locally would be unknown to the server and every
	// activation would be rejected, which is exactly the anti-cheat behaviour we want to rely on.
	if (!ASC->IsOwnerActorAuthoritative())
	{
		return;
	}

	for (const FTFPSAbilitySet_GameplayAbility& Entry : GrantedAbilities)
	{
		if (!Entry.Ability)
		{
			UE_LOG(LogTFPS, Error, TEXT("Null ability in ability set [%s]."), *GetNameSafe(this));
			continue;
		}

		FGameplayAbilitySpec Spec(Entry.Ability, Entry.AbilityLevel, INDEX_NONE, SourceObject);
		if (Entry.InputTag.IsValid())
		{
			Spec.GetDynamicSpecSourceTags().AddTag(Entry.InputTag);
		}

		const FGameplayAbilitySpecHandle Handle = ASC->GiveAbility(Spec);
		if (OutGrantedHandles)
		{
			OutGrantedHandles->AddAbilitySpecHandle(Handle);
		}
	}

	for (const FTFPSAbilitySet_GameplayEffect& Entry : GrantedEffects)
	{
		if (!Entry.GameplayEffect)
		{
			UE_LOG(LogTFPS, Error, TEXT("Null effect in ability set [%s]."), *GetNameSafe(this));
			continue;
		}

		FGameplayEffectContextHandle Context = ASC->MakeEffectContext();
		Context.AddSourceObject(SourceObject);

		const FActiveGameplayEffectHandle Handle = ASC->ApplyGameplayEffectToSelf(
			Entry.GameplayEffect->GetDefaultObject<UGameplayEffect>(), Entry.EffectLevel, Context);

		if (OutGrantedHandles)
		{
			OutGrantedHandles->AddGameplayEffectHandle(Handle);
		}
	}
}
