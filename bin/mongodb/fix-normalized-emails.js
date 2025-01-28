const dry = false;
const gmailOrProton = [
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'proton.me',
  'gmail.com',
  'googlemail.com',
];

function normalize(email) {
  let [name, domain] = email.toLowerCase().split('@');
  [name] = name.split('+');

  if (gmailOrProton.includes(domain)) name = name.replace(/\./g, '');

  return name + '@' + domain;
}

let nbUpdates = 0;
let nbDups = 0;

db.user4.find({ email: /^[^+]+\+.*@.+$/ }, { email: 1, verbatimEmail: 1, username: 1 }).forEach(user => {
  const normalized = normalize(user.email);
  const verbatim = user.verbatimEmail || user.email;
  print(user.username, ': ', verbatim, '->', normalized);

  const updates = {};
  if (normalized != user.email) updates.email = normalized;
  if (verbatim != user.email) updates.verbatimEmail = verbatim;

  if (!dry && Object.keys(updates).length) {
    try {
      db.user4.updateOne({ _id: user._id }, { $set: updates });
      db.user_email_backup.update(
        { _id: user._id },
        { $set: { email: user.email, verbatimEmail: user.verbatimEmail } },
        { upsert: true },
      );
      nbUpdates++;
    } catch (e) {
      if (e.code == 11000) nbDups++;
    }
  }
});

print('updated:', nbUpdates);
print('skiped duplicates:', nbDups);
