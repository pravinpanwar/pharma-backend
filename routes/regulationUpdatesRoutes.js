const express = require('express');
const router = express.Router();

// Mock database
let regulationUpdates = [
  {
    id: 1,
    title: "FDA Guidance on COVID-19 Vaccine Development",
    description: "New guidance released for pharmaceutical companies developing COVID-19 vaccines.",
    category: "FDA",
    date: "2024-03-15",
    read: false
  },
  {
    id: 2,
    title: "EMA Updates Good Manufacturing Practice Guidelines",
    description: "The European Medicines Agency has released updates to its GMP guidelines.",
    category: "EMA",
    date: "2024-03-10",
    read: false
  },
  {
    id: 3,
    title: "WHO Recommendations on Antimicrobial Resistance",
    description: "New recommendations to combat antimicrobial resistance in pharmaceutical manufacturing.",
    category: "WHO",
    date: "2024-03-05",
    read: false
  },
  {
    id: 4,
    title: "ICH Q12 Implementation in US and EU",
    description: "Updates on the implementation of ICH Q12 guideline in the United States and European Union.",
    category: "ICH",
    date: "2024-02-28",
    read: false
  },
  {
    id: 5,
    title: "New Pharmacovigilance Regulations in Canada",
    description: "Health Canada announces new regulations for pharmacovigilance reporting.",
    category: "Other",
    date: "2024-02-20",
    read: false
  }
];

// GET all regulation updates
router.get('/', (req, res) => {
  res.json(regulationUpdates);
});

// Mark an update as read
router.patch('/:id/read', (req, res) => {
  const { id } = req.params;
  const updateIndex = regulationUpdates.findIndex(update => update.id === parseInt(id));
  
  if (updateIndex === -1) {
    return res.status(404).json({ error: 'Update not found' });
  }

  regulationUpdates[updateIndex].read = true;
  res.json(regulationUpdates[updateIndex]);
});

// Add a new regulation update (for admin use)
router.post('/', (req, res) => {
  const { title, description, category, date } = req.body;
  
  if (!title || !description || !category || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newUpdate = {
    id: regulationUpdates.length + 1,
    title,
    description,
    category,
    date,
    read: false
  };

  regulationUpdates.push(newUpdate);
  res.status(201).json(newUpdate);
});

module.exports = router;