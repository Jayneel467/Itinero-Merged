import React from 'react';
import { Check } from 'lucide-react';
import styles from './BookingStepper.module.css';

export default function BookingStepper({ currentStep = 1 }) {
  const steps = [
    { num: 1, label: 'Select Room' },
    { num: 2, label: 'Guest Details' },
    { num: 3, label: 'Payment' },
    { num: 4, label: 'Confirmation' }
  ];

  return (
    <div className={styles.stepperContainer}>
      {steps.map((step, index) => {
        const isActive = currentStep === step.num;
        const isCompleted = currentStep > step.num;
        return (
          <React.Fragment key={step.num}>
            <div className={`${styles.step} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}>
              <div className={`${styles.stepNumber} ${isActive ? styles.stepNumberActive : ''} ${isCompleted ? styles.stepNumberCompleted : ''}`}>
                {isCompleted ? <Check size={14} strokeWidth={3} /> : step.num}
              </div>
              <span>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <span className={styles.separator}>→</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
