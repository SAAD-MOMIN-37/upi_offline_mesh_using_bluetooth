import { useState } from 'react'
import { useAuthStore } from '@hooks/useAuthStore'
import { ArrowRight, ArrowLeft, CheckCircle, Shield, Wifi, Bluetooth, Zap, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to UPI Mesh Pay',
    subtitle: 'Offline-first payments via Bluetooth mesh',
    icon: Shield,
    description: 'Send money anywhere — even without internet. Your payments travel through a mesh of nearby phones until they reach the network.'
  },
  {
    id: 'how-it-works',
    title: 'How It Works',
    subtitle: 'Three simple steps',
    icon: Zap,
    steps: [
      { icon: Bluetooth, title: 'Create Payment', desc: 'Enter amount and recipient. Payment is encrypted on your device.' },
      { icon: Wifi, title: 'Mesh Gossip', desc: 'Encrypted packet hops phone-to-phone via Bluetooth.' },
      { icon: CheckCircle, title: 'Auto Settlement', desc: 'When any device reaches internet, payment settles instantly.' }
    ]
  },
  {
    id: 'security',
    title: 'Your Security',
    subtitle: 'Built-in protection',
    icon: Shield,
    features: [
      'End-to-end encryption (RSA-OAEP + AES-256-GCM)',
      'Atomic idempotency — no double charges ever',
      '24-hour replay protection',
      'PIN + biometric authentication',
      'Open source, auditable code'
    ]
  },
  {
    id: 'setup',
    title: 'Set Up Your Account',
    subtitle: 'Add a bank account to start',
    icon: Shield,
    action: true
  }
]

export default function OnboardingPage() {
  const { setOnboarded, setPinHash, isOnboarded } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  
  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }
  
  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }
  
  const handleComplete = async () => {
    setLoading(true)
    // In a real app, link bank account here
    // For demo, just mark onboarding complete
    setOnboarded(true)
    setLoading(false)
  }
  
  const step = STEPS[currentStep]
  const progress = ((currentStep + 1) / STEPS.length) * 100
  
  return (
    <div className="min-h-screen flex flex-col bg-mesh-bg">
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-mesh-border z-50">
        <div 
          className="h-full bg-gradient-to-r from-mesh-accent to-mesh-success transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="flex-1 flex flex-col p-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i < currentStep ? 'bg-mesh-success text-white' :
                i === currentStep ? 'bg-mesh-accent text-white' : 'bg-mesh-border text-mesh-muted'
              }`}>
                {i < currentStep ? <CheckCircle className="w-5 h-5" /> : <span>{i + 1}</span>}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-16 h-0.5 rounded ${i < currentStep ? 'bg-mesh-success' : 'bg-mesh-border'}`} />
              )}
            </div>
          ))}
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-mesh-accent/20 flex items-center justify-center mx-auto mb-4">
              <step.icon className="w-8 h-8 text-mesh-accent" />
            </div>
            <h1 className="text-2xl font-bold text-mesh-text mb-2">{step.title}</h1>
            <p className="text-mesh-muted">{step.subtitle}</p>
          </div>
          
          <div className="flex-1">
            {step.id === 'how-it-works' && (
              <div className="space-y-6">
                {step.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-mesh-card rounded-2xl border border-mesh-border">
                    <div className="w-12 h-12 rounded-xl bg-mesh-accent/20 flex items-center justify-center flex-shrink-0">
                      <s.icon className="w-6 h-6 text-mesh-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-mesh-text">{s.title}</h3>
                      <p className="text-sm text-mesh-muted mt-1">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {step.id === 'security' && (
              <div className="space-y-4">
                {step.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-mesh-card rounded-2xl border border-mesh-border">
                    <CheckCircle className="w-6 h-6 text-mesh-success flex-shrink-0" />
                    <p className="text-mesh-text">{f}</p>
                  </div>
                ))}
              </div>
            )}
            
            {step.id === 'setup' && (
              <div className="space-y-4">
                <div className="card bg-mesh-accent/10 border-mesh-accent/50">
                  <h3 className="font-semibold text-mesh-text mb-2">Ready to get started?</h3>
                  <p className="text-mesh-muted text-sm">
                    We'll guide you through linking your bank account and setting up your PIN.
                  </p>
                </div>
                
                <button onClick={handleComplete} disabled={loading} className="btn-primary w-full py-4 text-lg">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Get Started'}
                </button>
                
                <p className="text-center text-xs text-mesh-muted mt-4">
                  By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            )}
          </div>
          
          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-mesh-border">
            <button 
              onClick={goBack} 
              disabled={currentStep === 0}
              className="btn-ghost"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
            
            <div className="flex items-center gap-2 text-sm text-mesh-muted">
              {STEPS.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= currentStep ? 'bg-mesh-accent' : 'bg-mesh-border'
                  }`}
                />
              ))}
            </div>
            
            {currentStep < STEPS.length - 1 ? (
              <button onClick={goNext} className="btn-primary">
                Next <ArrowRight className="w-5 h-5" />
              </button>
            ) : step.action ? null : (
              <button onClick={handleComplete} disabled={loading} className="btn-primary">
                Get Started <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}