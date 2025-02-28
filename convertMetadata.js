const fs = require('fs');
const path = require('path');

const updateJsonFiles = (dirPath) => {
  const files = fs.readdirSync(dirPath);

  files.forEach((file, index) => {
    if (path.extname(file) === '.json') {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      const newData = {
        image: `ipfs://bafybeih3p5sbzqqlrg5zi2n3xp6xiv7hdudlstwsegb4pda442azsmcgzu/${file.slice(
          0,
          -5
        )}.webp`,
        description:
          'Attentionless is a collection of generative collages of CC0 images in the style of abstractionism made by Kirill Ateev. The growing entropy of events foams at the junctions of the will of the subjects, adding up to a much more complex scene of everything.',
        external_url: 'https://ateev.art',
      };

      const rawContent = fs.readFileSync(filePath, 'utf8');
      const content = JSON.parse(rawContent);
      const updated = { ...content, ...newData };

      fs.writeFileSync(filePath, JSON.stringify(updated));
      console.log('Updated: ', filePath);
      fs.chmodSync(filePath, stats.mode);
    }
  });
};

updateJsonFiles('./output/metadata');
