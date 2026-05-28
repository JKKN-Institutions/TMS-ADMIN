#!/usr/bin/env python3
"""
JKKN Terminology Validator

Scans files for prohibited terminology and suggests JKKN-compliant replacements.
Usage: python validate_terminology.py <file_or_directory> [--fix] [--output json|text]
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Critical terms (Zero Tolerance) - MUST be replaced
CRITICAL_TERMS = {
    # Learner Community
    r'\bstudent\b': 'learner',
    r'\bstudents\b': 'learners',
    r'\bpupil\b': 'learner',
    r'\bpupils\b': 'learners',
    r'\bkids\b': 'young learners',
    r'\bchildren\b': 'young learners',
    r'\btrainee\b': 'learner',
    r'\btrainees\b': 'learners',
    r'\bstudent body\b': 'learner community',

    # Teaching Staff
    r'\bfaculty\b': 'learning facilitators',
    r'\bteacher\b': 'learning facilitator',
    r'\bteachers\b': 'learning facilitators',
    r'\bprofessor\b': 'learning facilitator',
    r'\bprofessors\b': 'learning facilitators',
    r'\binstructor\b': 'learning facilitator',
    r'\binstructors\b': 'learning facilitators',
    r'\btutor\b': 'learning facilitator',
    r'\btutors\b': 'learning facilitators',
    r'\beducator\b': 'learning facilitator',
    r'\beducators\b': 'learning facilitators',

    # Non-Academic Staff
    r'\bstaff\b': 'team members',
    r'\bemployees\b': 'team members',
    r'\bworkers\b': 'team members',

    # Learning Spaces
    r'\bclassroom\b': 'learning studio',
    r'\bclassrooms\b': 'learning studios',
    r'\blecture hall\b': 'learning auditorium',
    r'\blecture halls\b': 'learning auditoriums',
    r'\blab\b': 'learning lab',
    r'\blabs\b': 'learning labs',
    r'\blaboratory\b': 'learning lab',
    r'\blaboratories\b': 'learning labs',
    r'\bworkshop\b': 'learning lab',
    r'\bworkshops\b': 'learning labs',
    r'\bstudy hall\b': 'learning commons',
    r'\bstudy halls\b': 'learning commons',
    r'\bstudy room\b': 'learning commons',
    r'\bstudy rooms\b': 'learning commons',

    # Academic Structures
    r'\bcourse outcomes?\b': 'learning outcomes',
    r'\bteaching objectives?\b': 'learning objectives',
    r'\bsyllabus\b': 'learning pathway',
    r'\bsyllabi\b': 'learning pathways',
    r'\bcurriculum\b': 'learning framework',
    r'\bcurricula\b': 'learning frameworks',
    r'\bgrades?\b': 'learning assessments',
    r'\bmarks?\b': 'learning assessments',
}

# Highly Encouraged terms - SHOULD be replaced
ENCOURAGED_TERMS = {
    r'\bfailed\b': 'did not meet learning outcomes',
    r'\bfailure\b': 'not meeting learning outcomes',
    r'\bflunked\b': 'did not meet learning outcomes',
    r'\bpassed\b': 'achieved learning outcomes',
    r'\btest\b': 'learning assessment',
    r'\btests\b': 'learning assessments',
    r'\bexam\b': 'learning assessment',
    r'\bexams\b': 'learning assessments',
    r'\bexamination\b': 'learning assessment',
    r'\bhomework\b': 'independent learning activities',
    r'\bassignment\b': 'learning task',
    r'\bassignments\b': 'learning tasks',
    r'\bquiz\b': 'quick assessment',
    r'\bquizzes\b': 'quick assessments',
    r'\bmidterm\b': 'progress assessment',
    r'\bfinal exam\b': 'culminating assessment',
    r'\breport card\b': 'learning progress report',
    r'\bdetention\b': 'reflection time',
    r'\bsuspension\b': 'temporary learning pause',
    r'\bexpelled\b': 'learning journey transition',
    r'\bpunishment\b': 'learning opportunity',
    r'\bdiscipline\b': 'behavioral guidance',
    r'\battendance\b': 'learning participation',
    r'\babsent\b': 'non-participating',
    r'\btardy\b': 'delayed arrival',
    r'\blate\b': 'delayed arrival',
    r'\bparent-teacher\b': 'learning partner',
    r'\benrollment\b': 'learning journey registration',
    r'\badmission\b': 'learning community acceptance',
    r'\bdropout\b': 'learning journey pause',
    r'\bgraduation\b': 'learning milestone celebration',
}

# File extensions to scan
SCANNABLE_EXTENSIONS = {
    '.py', '.js', '.ts', '.tsx', '.jsx', '.vue', '.svelte',
    '.html', '.css', '.scss', '.sass', '.less',
    '.json', '.yaml', '.yml', '.toml',
    '.md', '.mdx', '.txt', '.rst',
    '.sql', '.prisma', '.graphql',
    '.env', '.env.local', '.env.example',
    '.xml', '.svg',
}

# Directories to skip
SKIP_DIRS = {
    'node_modules', '.git', '.next', 'dist', 'build',
    '__pycache__', '.cache', 'coverage', '.turbo',
    'vendor', '.venv', 'venv', 'env',
}


class TerminologyViolation:
    def __init__(self, file_path: str, line_num: int, line_content: str,
                 term: str, replacement: str, severity: str):
        self.file_path = file_path
        self.line_num = line_num
        self.line_content = line_content.strip()
        self.term = term
        self.replacement = replacement
        self.severity = severity  # 'critical' or 'encouraged'

    def to_dict(self) -> dict:
        return {
            'file': self.file_path,
            'line': self.line_num,
            'content': self.line_content,
            'term': self.term,
            'replacement': self.replacement,
            'severity': self.severity
        }

    def __str__(self) -> str:
        icon = '🔴' if self.severity == 'critical' else '🟡'
        return (f"{icon} {self.file_path}:{self.line_num}\n"
                f"   Found: '{self.term}' → Replace with: '{self.replacement}'\n"
                f"   Line: {self.line_content[:80]}{'...' if len(self.line_content) > 80 else ''}")


def scan_file(file_path: str) -> List[TerminologyViolation]:
    """Scan a single file for terminology violations."""
    violations = []

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}", file=sys.stderr)
        return violations

    for line_num, line in enumerate(lines, 1):
        # Check critical terms
        for pattern, replacement in CRITICAL_TERMS.items():
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                violations.append(TerminologyViolation(
                    file_path=file_path,
                    line_num=line_num,
                    line_content=line,
                    term=match.group(),
                    replacement=replacement,
                    severity='critical'
                ))

        # Check encouraged terms
        for pattern, replacement in ENCOURAGED_TERMS.items():
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                violations.append(TerminologyViolation(
                    file_path=file_path,
                    line_num=line_num,
                    line_content=line,
                    term=match.group(),
                    replacement=replacement,
                    severity='encouraged'
                ))

    return violations


def scan_directory(dir_path: str) -> List[TerminologyViolation]:
    """Recursively scan a directory for terminology violations."""
    violations = []

    for root, dirs, files in os.walk(dir_path):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for file in files:
            ext = Path(file).suffix.lower()
            if ext in SCANNABLE_EXTENSIONS:
                file_path = os.path.join(root, file)
                violations.extend(scan_file(file_path))

    return violations


def fix_file(file_path: str, violations: List[TerminologyViolation]) -> bool:
    """Apply fixes to a file based on violations."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Apply replacements (critical terms only for auto-fix)
        for pattern, replacement in CRITICAL_TERMS.items():
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return True
    except Exception as e:
        print(f"Error fixing {file_path}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description='JKKN Terminology Validator - Scans for prohibited terminology'
    )
    parser.add_argument('path', help='File or directory to scan')
    parser.add_argument('--fix', action='store_true',
                        help='Automatically fix critical term violations')
    parser.add_argument('--output', choices=['text', 'json'], default='text',
                        help='Output format (default: text)')
    parser.add_argument('--severity', choices=['all', 'critical', 'encouraged'],
                        default='all', help='Filter by severity level')

    args = parser.parse_args()

    path = args.path

    if not os.path.exists(path):
        print(f"Error: Path '{path}' does not exist", file=sys.stderr)
        sys.exit(1)

    # Scan for violations
    if os.path.isfile(path):
        violations = scan_file(path)
    else:
        violations = scan_directory(path)

    # Filter by severity
    if args.severity != 'all':
        violations = [v for v in violations if v.severity == args.severity]

    # Apply fixes if requested
    if args.fix:
        files_to_fix = set(v.file_path for v in violations if v.severity == 'critical')
        for file_path in files_to_fix:
            file_violations = [v for v in violations if v.file_path == file_path]
            if fix_file(file_path, file_violations):
                print(f"Fixed: {file_path}")
        print(f"\nFixed {len(files_to_fix)} files")
        return

    # Output results
    if args.output == 'json':
        result = {
            'total_violations': len(violations),
            'critical_count': len([v for v in violations if v.severity == 'critical']),
            'encouraged_count': len([v for v in violations if v.severity == 'encouraged']),
            'violations': [v.to_dict() for v in violations]
        }
        print(json.dumps(result, indent=2))
    else:
        if not violations:
            print("✅ No terminology violations found!")
            sys.exit(0)

        print(f"\n{'='*60}")
        print(f"JKKN TERMINOLOGY VALIDATION REPORT")
        print(f"{'='*60}\n")

        critical = [v for v in violations if v.severity == 'critical']
        encouraged = [v for v in violations if v.severity == 'encouraged']

        if critical:
            print(f"🔴 CRITICAL VIOLATIONS ({len(critical)}):")
            print("-" * 40)
            for v in critical:
                print(v)
                print()

        if encouraged:
            print(f"\n🟡 ENCOURAGED CHANGES ({len(encouraged)}):")
            print("-" * 40)
            for v in encouraged:
                print(v)
                print()

        print(f"\n{'='*60}")
        print(f"SUMMARY: {len(critical)} critical, {len(encouraged)} encouraged")
        print(f"{'='*60}")

        if critical:
            sys.exit(1)  # Exit with error if critical violations found


if __name__ == '__main__':
    main()
