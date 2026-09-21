import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOnboardingComplete } from '../db/settings';
import WelcomeCarousel from './onboarding/WelcomeCarousel';
import ChildrenStep from './onboarding/ChildrenStep';
import CarersStep from './onboarding/CarersStep';

type Step = 'welcome' | 'children' | 'carers';

const PROGRESS_STEPS: Step[] = ['children', 'carers'];

interface OnboardingScreenProps {
  /** Lets the router stop redirecting here once setup is finished. */
  onComplete: () => void;
}

/**
 * First-launch setup: welcome, children, carers.
 *
 * Skipping the welcome slides jumps straight to adding children rather than
 * out of setup altogether — the app needs at least one child and one carer
 * before any planning screen has something to show.
 */
export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await setOnboardingComplete();
      onComplete();
      navigate('/', { replace: true });
    } catch {
      setError('Could not save your setup. Please try again.');
      setSaving(false);
    }
  }

  const progressIndex = PROGRESS_STEPS.indexOf(step);

  return (
    // Onboarding sits outside the main shell (it has no bottom nav), so it
    // brings its own — without it nothing establishes full height and the
    // content bunches at the top of the screen.
    <div className="app-shell">
      <div className="screen onboarding">
        {progressIndex >= 0 && (
          <div className="step-progress" aria-label={`Step ${progressIndex + 1} of ${PROGRESS_STEPS.length}`}>
            {PROGRESS_STEPS.map((name, i) => (
              <span key={name} className={i <= progressIndex ? 'step-bar step-bar--done' : 'step-bar'} />
            ))}
          </div>
        )}

        {step === 'welcome' && <WelcomeCarousel onDone={() => setStep('children')} />}
        {step === 'children' && <ChildrenStep onNext={() => setStep('carers')} />}
        {step === 'carers' && <CarersStep onDone={finish} busy={saving} />}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
