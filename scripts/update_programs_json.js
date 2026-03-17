const fs = require('fs');
const path = require('path');

const filePath = 'D:\\balasundar\\admission_2026\\bhc_admission_system\\public\\admission2026.programs.json';

try {
  const data = fs.readFileSync(filePath, 'utf8');
  const programs = JSON.parse(data);

  const updatedPrograms = programs.map(program => {
    if (program.eligibility_subjects || program.eligibility_description || program.cutoff) {
      if (!program.stream_specifications) {
        program.stream_specifications = [];
      }
      
      program.stream_specifications.push({
        stream: program.stream,
        eligibility_subjects: program.eligibility_subjects,
        eligibility_description: program.eligibility_description,
        cutoff: program.cutoff
      });

      delete program.eligibility_subjects;
      delete program.eligibility_description;
      delete program.cutoff;
    }
    return program;
  });

  fs.writeFileSync(filePath, JSON.stringify(updatedPrograms, null, 2));
  console.log('Successfully updated admission2026.programs.json');
} catch (error) {
  console.error('Error updating JSON file:', error);
}
