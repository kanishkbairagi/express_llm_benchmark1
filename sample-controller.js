export const getUserProfile = (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (userId === 'admin') {
    return res.status(200).json({ id: 'admin', role: 'administrator' });
  }

  return res.status(200).json({ id: userId, role: 'standard_user' });
};