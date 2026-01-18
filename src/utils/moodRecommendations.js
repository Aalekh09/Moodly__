// Mood-based Recommendations System

const recommendations = {
  1: { // Very Sad
    activities: [
      'Take a warm bath or shower',
      'Listen to calming music',
      'Reach out to a friend or family member',
      'Practice deep breathing exercises',
      'Write in a journal about your feelings',
      'Take a gentle walk outside',
      'Watch a comforting movie or show',
      'Try a guided meditation',
      'Do something creative (draw, paint, write)',
      'Get some fresh air and sunlight'
    ],
    tips: [
      'Remember that it\'s okay to feel sad sometimes',
      'Consider talking to someone you trust',
      'Be gentle with yourself today',
      'Small steps forward are still progress'
    ]
  },
  2: { // Sad
    activities: [
      'Go for a walk in nature',
      'Call or text a loved one',
      'Listen to uplifting music',
      'Do some light exercise or stretching',
      'Read a book or article you enjoy',
      'Practice gratitude by listing 3 things you\'re thankful for',
      'Try a new hobby or activity',
      'Spend time with a pet if you have one',
      'Cook or order your favorite meal',
      'Watch something funny or entertaining'
    ],
    tips: [
      'Your feelings are valid',
      'Tomorrow is a new day',
      'Consider what might help you feel better',
      'Self-care is important'
    ]
  },
  3: { // Neutral
    activities: [
      'Plan something you\'re looking forward to',
      'Try a new activity or hobby',
      'Connect with friends or family',
      'Set a small goal for the day',
      'Learn something new',
      'Organize or declutter a space',
      'Exercise or do physical activity',
      'Practice mindfulness or meditation',
      'Do something creative',
      'Spend time in nature'
    ],
    tips: [
      'This is a good time to build positive habits',
      'Consider what would make you feel even better',
      'Small positive actions can improve your mood',
      'Stay present and mindful'
    ]
  },
  4: { // Good
    activities: [
      'Share your positive energy with others',
      'Continue doing what makes you happy',
      'Help someone else feel good',
      'Celebrate your positive mood',
      'Try something new or challenging',
      'Exercise or be active',
      'Spend time with loved ones',
      'Pursue a hobby or interest',
      'Set and work toward a goal',
      'Practice gratitude'
    ],
    tips: [
      'Great job maintaining a positive mood!',
      'Use this energy to build good habits',
      'Share your positivity with others',
      'Remember what helps you feel this way'
    ]
  },
  5: { // Very Happy
    activities: [
      'Share your joy with others',
      'Do something you love',
      'Help someone else feel happy',
      'Celebrate and appreciate this moment',
      'Try something exciting or new',
      'Be active and energetic',
      'Spend quality time with loved ones',
      'Express gratitude for your happiness',
      'Set ambitious but achievable goals',
      'Document what made you feel this way'
    ],
    tips: [
      'Wonderful! You\'re feeling great!',
      'Remember what contributes to your happiness',
      'Share your positive energy',
      'Use this momentum to build lasting habits'
    ]
  }
};

export const getRecommendations = (moodLevel) => {
  const level = Math.max(1, Math.min(5, Math.round(moodLevel)));
  return recommendations[level] || recommendations[3];
};

export const getRandomActivity = (moodLevel) => {
  const recs = getRecommendations(moodLevel);
  const activities = recs.activities;
  return activities[Math.floor(Math.random() * activities.length)];
};

export const getRandomTip = (moodLevel) => {
  const recs = getRecommendations(moodLevel);
  const tips = recs.tips;
  return tips[Math.floor(Math.random() * tips.length)];
};

export const getAllActivities = (moodLevel) => {
  return getRecommendations(moodLevel).activities;
};

export const getAllTips = (moodLevel) => {
  return getRecommendations(moodLevel).tips;
};

