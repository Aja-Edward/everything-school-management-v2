"""
Papers typed with the options run together on one line convert to questions.

A Plain Page set the usual way, "A. keep B. put C. make D. let" and
"(a) Girls alone (b) Boys alone", came out with 3 questions out of 42: the
parser only took options one per line. Converting it now reads each one.
"""
from django.test import SimpleTestCase

from exam.document_parser import ExamDocumentParser, split_inline_options, split_passage


def parse(text):
    return ExamDocumentParser(text.encode("utf-8"), "pasted-exam.txt").parse()


class SplitInlineOptionsTest(SimpleTestCase):
    def test_lettered_options_on_one_line(self):
        self.assertEqual(
            split_inline_options("A. keep B. put C. make D. let"),
            ["A. keep", "B. put", "C. make", "D. let"],
        )

    def test_bracketed_options_even_without_a_space(self):
        self.assertEqual(
            split_inline_options("(a) encourages (b)for (c) child (d) education"),
            ["(a) encourages", "(b)for", "(c) child", "(d) education"],
        )

    def test_a_second_row_carries_on_from_its_own_letter(self):
        self.assertEqual(
            split_inline_options("(c) Women and girls (d) Boys and girls"),
            ["(c) Women and girls", "(d) Boys and girls"],
        )

    def test_a_question_is_never_split(self):
        line = "6. She said B. and then stopped at C. Street"
        self.assertEqual(split_inline_options(line), [line])

    def test_options_must_follow_in_order(self):
        """An option that merely mentions a letter is not cut there."""
        self.assertEqual(split_inline_options("A. Vitamin C. intake"), ["A. Vitamin C. intake"])


class PaperWithInlineOptionsTest(SimpleTestCase):
    PAPER = "\n".join([
        "SECTION A: OBJECTIVE",
        "COMPREHENSION",
        "Read the passage carefully and answer the questions that follow it.",
        "Gender refers to sex, male and female.",
        "QUESTIONS",
        "1. Gender issues deal more with matters that concern ______.",
        "(a) Girls alone (b) Boys alone",
        "(c) Women and girls (d) Boys and girls",
        "INSTRUCTION: Choose the option nearest in meaning.",
        "2. The teacher was furious.",
        "A. happy B. angry C. tired D. calm",
        "SECTION B LITERARY APPRECIATION - Choose the best option",
        "3. The main idea of a story is called its _______.",
        "A. plot B. theme C. character D. setting",
    ])

    def setUp(self):
        self.sections = parse(self.PAPER)["sections"]

    def test_every_question_is_read(self):
        self.assertEqual([len(s["questions"]) for s in self.sections], [2, 1])

    def test_options_are_split(self):
        first = self.sections[0]["questions"][0]
        self.assertEqual(list(first["options"].values()),
                         ["Girls alone", "Boys alone", "Women and girls", "Boys and girls"])

    def test_the_passage_belongs_to_the_section_not_question_one(self):
        section = self.sections[0]
        self.assertIn("Gender refers to sex", section["instructions"])
        self.assertNotIn("Gender refers to sex", section["questions"][0]["question"])

    def test_a_mid_section_instruction_stays_above_its_question(self):
        question = self.sections[0]["questions"][1]["question"]
        self.assertIn("INSTRUCTION: Choose the option nearest in meaning.", question)
        self.assertIn("The teacher was furious.", question)

    def test_a_section_heading_with_only_a_space_is_a_section(self):
        self.assertEqual(self.sections[1]["name"],
                         "Section B: LITERARY APPRECIATION - Choose the best option")
        self.assertEqual(self.sections[1]["type"], "objective")


PARAGRAPH = (
    "All over the world, women are faced with several violations of their human rights. "
    "They are denied participation in the decisions that affect their lives."
)


class SplitPassageTest(SimpleTestCase):
    def test_short_lines_before_the_first_paragraph_are_instructions(self):
        self.assertEqual(
            split_passage(["COMPREHENSION", "Read the passage carefully.", PARAGRAPH, PARAGRAPH, "QUESTIONS"]),
            (["COMPREHENSION", "Read the passage carefully."], [PARAGRAPH, PARAGRAPH, "QUESTIONS"]),
        )

    def test_no_paragraph_means_no_passage(self):
        self.assertEqual(split_passage(["Choose the correct option.", ""]), (["Choose the correct option."], []))


class PaperWithPassageTest(SimpleTestCase):
    def test_the_passage_is_kept_apart_from_the_instructions(self):
        section = parse("\n".join([
            "SECTION A: OBJECTIVE",
            "COMPREHENSION",
            "Read the passage carefully and answer the questions that follow it.",
            PARAGRAPH,
            "1. Women are denied ______.",
            "A. food B. participation C. money D. land",
        ]))["sections"][0]
        self.assertEqual(section["instructions"],
                         "COMPREHENSION\nRead the passage carefully and answer the questions that follow it.")
        self.assertEqual(section["passage"], PARAGRAPH)
        self.assertNotIn("women are faced", section["questions"][0]["question"])
