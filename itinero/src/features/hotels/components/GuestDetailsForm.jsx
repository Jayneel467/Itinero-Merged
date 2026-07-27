import React, { useState } from 'react';
import { ShieldCheck, Plus } from 'lucide-react';
import styles from './GuestDetailsForm.module.css';

const SPECIAL_REQUEST_TAGS = [
  'High floor', 'Non-smoking room', 'Twin beds', 'Extra bed', 'Late check-in', 'Anniversary'
];

export default function GuestDetailsForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    nationality: '',
    dob: '',
    gender: 'male',
    idProofType: '',
    idProofNumber: '',
    ageAgreed: false
  });

  const [selectedTags, setSelectedTags] = useState([]);
  const [specialNote, setSpecialNote] = useState('');
  const [showAdditionalGuest, setShowAdditionalGuest] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className={styles.formContainer}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Guest Details</h2>
        <p className={styles.subtitle}>Please provide accurate details for a smooth check-in experience.</p>
      </div>

      {/* Security Banner */}
      <div className={styles.securityBanner}>
        <ShieldCheck size={18} />
        <span>We protect your data and your information is secure with us.</span>
      </div>

      {/* Primary Guest Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Primary Guest (Room 1)</h3>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>First Name</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter first name"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Last Name</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter last name"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter email address"
            />
          </div>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Phone Number</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter phone number"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Nationality</label>
            <input
              type="text"
              name="nationality"
              value={formData.nationality}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter nationality"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Date of Birth</label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Gender</label>
            <div className={styles.radioGroup}>
              {['male', 'female', 'other'].map(g => (
                <label key={g} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={formData.gender === g}
                    onChange={handleChange}
                    className={styles.radioInput}
                  />
                  <span className={styles.radioCustom} />
                  <span className={styles.radioText}>{g.charAt(0).toUpperCase() + g.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>ID Proof Type</label>
            <select
              name="idProofType"
              value={formData.idProofType}
              onChange={handleChange}
              className={styles.input}
            >
              <option value="">Select ID type</option>
              <option value="passport">Passport</option>
              <option value="aadhar">Aadhar Card</option>
              <option value="driving">Driving License</option>
              <option value="voter">Voter ID</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>ID Proof Number</label>
            <input
              type="text"
              name="idProofNumber"
              value={formData.idProofNumber}
              onChange={handleChange}
              className={styles.input}
              placeholder="Enter ID number"
            />
          </div>
        </div>

        {/* Age Agreement */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            name="ageAgreed"
            checked={formData.ageAgreed}
            onChange={handleChange}
            className={styles.checkboxInput}
          />
          <span className={styles.checkboxCustom} />
          <span className={styles.checkboxText}>
            I agree that primary guest must be 18+ year old.
            <br />
            <span className={styles.checkboxSubtext}>A valid government-issued ID is required at check-in.</span>
          </span>
        </label>
      </div>

      {/* Additional Guest Section */}
      <div className={styles.section}>
        <div className={styles.additionalGuestHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Additional Guest (Room 1)</h3>
            <p className={styles.sectionSubtitle}>Add details of other guests (optional)</p>
          </div>
          <button
            className={styles.addGuestBtn}
            onClick={() => setShowAdditionalGuest(!showAdditionalGuest)}
          >
            <Plus size={16} /> Add Another Guest
          </button>
        </div>

        {showAdditionalGuest && (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>First Name</label>
              <input type="text" className={styles.input} placeholder="Enter first name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Last Name</label>
              <input type="text" className={styles.input} placeholder="Enter last name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Email Address</label>
              <input type="email" className={styles.input} placeholder="Enter email address" />
            </div>
          </div>
        )}
      </div>

      {/* Special Requests Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Special Requests (Optional)</h3>

        <div className={styles.tagsList}>
          {SPECIAL_REQUEST_TAGS.map(tag => (
            <button
              key={tag}
              className={`${styles.tagChip} ${selectedTags.includes(tag) ? styles.tagChipActive : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <textarea
          className={styles.textarea}
          placeholder="Any special requests? (e.g. birthday celebration, early check-in)"
          value={specialNote}
          onChange={e => setSpecialNote(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
}
