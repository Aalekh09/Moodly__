// ========================================
// CONTACT DISPLAY COMPONENT
// ========================================

import React from 'react';
import { Phone, MapPin, Clock, Mail, ExternalLink } from 'lucide-react';

/**
 * Contact information display component
 * Provides responsive contact information layout with clickable phone number for mobile
 */
export default function ContactDisplay({ darkMode = false }) {
  // Contact information for FitMood
  const contactInfo = {
    phone: '+1 (555) 123-4567',
    email: 'support@fitmood.app',
    address: {
      street: '123 Wellness Street',
      city: 'Health City',
      state: 'CA',
      zipCode: '90210',
      country: 'USA'
    },
    businessHours: 'Monday - Friday: 9:00 AM - 6:00 PM PST'
  };

  const handlePhoneClick = () => {
    window.location.href = `tel:${contactInfo.phone}`;
  };

  const handleEmailClick = () => {
    window.location.href = `mailto:${contactInfo.email}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">📞</div>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            Contact FitMood
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            We're here to help with your mood tracking journey
          </p>
        </div>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Phone Contact Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-3 rounded-full mr-4">
                <Phone className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                  Phone Support
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Call us directly for immediate assistance
                </p>
              </div>
            </div>
            
            <button
              onClick={handlePhoneClick}
              className="group w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              <Phone size={20} />
              <span className="text-lg">{contactInfo.phone}</span>
              <ExternalLink size={16} className="opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
            
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 text-center">
              Tap to call on mobile devices
            </p>
          </div>

          {/* Email Contact Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="bg-gradient-to-r from-pink-500 to-orange-500 p-3 rounded-full mr-4">
                <Mail className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                  Email Support
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Send us a detailed message
                </p>
              </div>
            </div>
            
            <button
              onClick={handleEmailClick}
              className="group w-full bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              <Mail size={20} />
              <span className="text-lg">{contactInfo.email}</span>
              <ExternalLink size={16} className="opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
            
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 text-center">
              We typically respond within 24 hours
            </p>
          </div>
        </div>

        {/* Address and Hours */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Address Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="bg-gradient-to-r from-green-500 to-teal-500 p-3 rounded-full mr-4">
                <MapPin className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                Our Location
              </h3>
            </div>
            
            <div className="space-y-2 text-gray-600 dark:text-gray-300">
              <p className="font-medium text-gray-800 dark:text-white">
                FitMood Headquarters
              </p>
              <p>{contactInfo.address.street}</p>
              <p>
                {contactInfo.address.city}, {contactInfo.address.state} {contactInfo.address.zipCode}
              </p>
              <p>{contactInfo.address.country}</p>
            </div>
          </div>

          {/* Business Hours Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-3 rounded-full mr-4">
                <Clock className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                Business Hours
              </h3>
            </div>
            
            <div className="space-y-2 text-gray-600 dark:text-gray-300">
              <p className="font-medium text-gray-800 dark:text-white">
                Support Available
              </p>
              <p>{contactInfo.businessHours}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                Outside business hours? Send us an email and we'll get back to you as soon as possible!
              </p>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="mt-8 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-indigo-200 dark:border-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-3">💬</div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              Need Help Getting Started?
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Our support team is here to help you make the most of your FitMood experience. 
              Whether you have questions about tracking your moods, setting up habits, or understanding your analytics, we're here to help!
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600">
                Account Setup
              </span>
              <span className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600">
                Mood Tracking Tips
              </span>
              <span className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600">
                Data Export
              </span>
              <span className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600">
                Technical Support
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">
            Powered by SAHA • Developed by AALEKH KUMAR
          </p>
          <p className="text-xs mt-1">
            Your mental health journey matters to us ❤️
          </p>
        </div>
      </div>
    </div>
  );
}