const users = {
  '1': {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@example.com'
  }
};

export function getUserProfile(req, res) {
  try {
    const userId = req.params?.id || req.query?.id;
    const user = users[userId];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
