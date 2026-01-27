# CSV Exam Upload Format Guide

This guide explains how to format your exam questions in a CSV file for upload to the platform.

## Quick Start

Download the template file: `exam_template.csv`

## CSV Structure

### Required Columns

- **Question**: The question text (REQUIRED)

### Optional Columns

- **Section**: Section name (e.g., "Objective", "Theory", "Practical", "Section A")
- **Type**: Question type - `objective`, `theory`, `practical`, or `custom`
- **OptionA** through **OptionE**: Multiple choice options (for objective questions)
- **CorrectAnswer**: The correct option letter (A, B, C, D, or E) for objective questions
- **Marks**: Points awarded for the question (default: 1)
- **ExpectedPoints**: Expected answer points or keywords (for theory/practical questions)
- **Instructions**: Section-specific instructions

## Question Types

### 1. Objective Questions (Multiple Choice)

**Required fields:**
- Question
- OptionA, OptionB (minimum 2 options)
- Type: `objective`

**Optional fields:**
- OptionC, OptionD, OptionE
- CorrectAnswer
- Marks

**Example:**
```csv
Section,Type,Question,OptionA,OptionB,OptionC,OptionD,CorrectAnswer,Marks
Objective,objective,What is the capital of France?,London,Paris,Berlin,Madrid,B,2
```

### 2. Theory Questions (Essay/Short Answer)

**Required fields:**
- Question
- Type: `theory`

**Optional fields:**
- Marks
- ExpectedPoints (marking scheme or key points)

**Example:**
```csv
Section,Type,Question,Marks,ExpectedPoints
Theory,theory,Explain the water cycle.,5,Mention evaporation condensation precipitation
```

### 3. Practical Questions

**Required fields:**
- Question
- Type: `practical`

**Optional fields:**
- Marks
- ExpectedPoints (expected outcome or procedure)

**Example:**
```csv
Section,Type,Question,Marks,ExpectedPoints
Practical,practical,Design an experiment to test pH.,10,Include hypothesis materials procedure
```

### 4. Custom Questions

**Required fields:**
- Question
- Type: `custom`

**Optional fields:**
- Marks

**Example:**
```csv
Section,Type,Question,Marks
Custom,custom,Compare French and American Revolutions.,15
```

## Exam Metadata (Optional)

You can include exam-level information in the first row by setting Section to `EXAM_INFO`:

**Example:**
```csv
Section,Type,Question,Marks,Instructions
EXAM_INFO,,,120,Final Exam. Answer all questions. No calculators.
```

**Fields:**
- **Question**: Exam title
- **Marks** or **Duration**: Duration in minutes
- **Instructions**: General exam instructions

## Tips for Success

### ✅ Best Practices

1. **Always include headers** in the first row
2. **Use UTF-8 encoding** when saving the CSV file
3. **Escape special characters** (the system handles this automatically)
4. **Keep questions concise** for better display
5. **Use consistent section names** to group related questions
6. **Test with a small file first** before uploading large exams

### ⚠️ Common Issues

- **Missing headers**: CSV must have column headers
- **Empty questions**: Rows with empty Question field are skipped
- **Invalid question types**: Unknown types are treated as 'custom'
- **Invalid marks**: Non-numeric marks default to 1
- **Fewer than 2 options**: Objective questions should have at least 2 options

## Full Example

Here's a complete exam with multiple question types:

```csv
Section,Type,Question,OptionA,OptionB,OptionC,OptionD,CorrectAnswer,Marks,ExpectedPoints,Instructions
EXAM_INFO,,,,,,,,,120,Mathematics Final Exam. Answer all questions.
Section A,objective,What is 2 + 2?,3,4,5,6,B,1,,Choose the correct answer
Section A,objective,What is 5 × 3?,10,15,20,25,B,1,,
Section B,theory,Explain the Pythagorean theorem.,,,,,,,5,Include formula and example,Answer any TWO questions
Section B,theory,Describe the quadratic formula.,,,,,,,5,Show derivation and use case,
Section C,practical,Solve the equation: x² - 5x + 6 = 0,,,,,,,10,Show all steps and verify solution,Show your work
```

## File Requirements

- **Format**: CSV (.csv)
- **Maximum size**: 10MB
- **Encoding**: UTF-8 (recommended) or Latin-1
- **Columns**: At minimum, must include a "Question" column

## What Happens After Upload

1. **Parsing**: The system reads and validates your CSV
2. **Preview**: You'll see a preview of parsed questions
3. **Warnings**: Any issues are displayed (e.g., missing options)
4. **Confidence**: System shows parsing confidence (high/medium/low)
5. **Import**: You can review and import the exam

## Need Help?

- Download and examine `exam_template.csv` for a working example
- Start with a simple file and gradually add complexity
- Check parsing warnings for specific issues
- Contact support if you encounter persistent problems

---

**Note**: CSV parsing always returns "high" confidence when successful, as the format is more structured than PDF/Word documents.
