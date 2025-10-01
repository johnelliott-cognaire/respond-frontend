#!/usr/bin/env python3
"""
Visual Regression Testing for Respond SPA
----------------------------------------
Take screenshots of components before and after CSS changes and compare them.
"""

import os
import argparse
import asyncio
from PIL import Image, ImageChops
import numpy as np
from playwright.async_api import async_playwright

# Component mapping to URLs/selectors
COMPONENT_SELECTORS = {
    # Core stage components from Functional Overview
    "QuestionsGrid": {
        "url": "/stages/answer-questions",
        "selector": ".questions-grid,.ag-root-wrapper",
        "trigger": None
    },
    "TopicTabs": {
        "url": "/stages/answer-questions",
        "selector": ".topic-tabs",
        "trigger": None
    },
    "ControlPane": {
        "url": "/stages/answer-questions",
        "selector": ".control-pane",
        "trigger": None
    },
    "AnalysisLMReviewGrid": {
        "url": "/stages/initial-review",
        "selector": ".analysis-lm-review-grid,.ag-root-wrapper",
        "trigger": None
    },
    "ApprovalRibbon": {
        "url": "/stages/review-answers",
        "selector": ".approval-ribbon",
        "trigger": None
    },
    
    # Modal components
    "AccountModal": {
        "url": "/",
        "selector": ".account-modal,.modal.form-modal",
        "trigger": "button[data-action='open-account-modal']"
    },
    "AccountsModal": {
        "url": "/",
        "selector": ".accounts-modal,.modal.form-modal",
        "trigger": "button[data-action='open-accounts']"
    },
    "UserModal": {
        "url": "/admin",
        "selector": ".user-modal,.modal.form-modal",
        "trigger": "button[data-action='open-user-modal']"
    },
    "UsersModal": {
        "url": "/admin",
        "selector": ".users-modal,.modal.form-modal",
        "trigger": "button[data-action='open-users-modal']"
    },
    "ProjectModal": {
        "url": "/",
        "selector": ".project-modal,.modal.form-modal",
        "trigger": "button[data-action='open-project-modal']"
    },
    "ProjectsModal": {
        "url": "/",
        "selector": ".projects-modal,.modal.form-modal",
        "trigger": "button[data-action='open-projects-modal']"
    },
    "ChooseContentForAIModal": {
        "url": "/stages/answer-questions",
        "selector": ".choose-content-modal,.modal.form-modal",
        "trigger": "button[data-action='choose-content']"
    },
    "DocumentsModal": {
        "url": "/",
        "selector": ".documents-modal,.modal.form-modal",
        "trigger": "button[data-action='open-documents']"
    },
    "JobsModal": {
        "url": "/",
        "selector": ".jobs-modal,.modal.form-modal",
        "trigger": "button[data-action='open-jobs-modal']"
    },
    
    # Framework components
    "DocumentTaskFramework": {
        "url": "/documents/view",
        "selector": ".doc-stage-breadcrumb",
        "trigger": None
    },
    "MultiStageDocument": {
        "url": "/documents/view",
        "selector": ".doc-main-content",
        "trigger": None
    },
    
    # Import steps
    "ImportWizard": {
        "url": "/stages/question-import",
        "selector": ".import-wizard-modal,.import-wizard-content",
        "trigger": "button[data-action='import-questions']"
    },
    "ImportStepSelectFile": {
        "url": "/stages/question-import", 
        "selector": ".import-step-select-file",
        "trigger": "button[data-action='import-questions']"
    },
    "ImportStepMapColumns": {
        "url": "/stages/question-import",
        "selector": ".import-step-map-columns",
        "trigger": None
    },
    "ImportStepPreview": {
        "url": "/stages/question-import",
        "selector": ".import-step-preview",
        "trigger": None
    },
    "ImportStepConfirm": {
        "url": "/stages/question-import",
        "selector": ".import-step-confirm",
        "trigger": None
    },
    "ImportStepResults": {
        "url": "/stages/question-import",
        "selector": ".import-step-results",
        "trigger": None
    },
    
    # Top UI elements
    "TopBar": {
        "url": "/", 
        "selector": ".top-bar",
        "trigger": None
    },
    "TabManager": {
        "url": "/",
        "selector": ".tabs-container", 
        "trigger": None
    },
    "NewTabMenu": {
        "url": "/",
        "selector": ".new-tab-menu",
        "trigger": "button[data-action='new-tab']"
    },
    "NotificationsBell": {
        "url": "/",
        "selector": ".notifications-dropdown",
        "trigger": "button.notifications-icon"
    }
}

async def take_component_screenshots(base_url, components, output_dir, auth=None):
    """Take screenshots of specified components"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        
        # Handle authentication if needed
        if auth:
            await page.goto(f"{base_url}/login")
            await page.fill("input[name='username']", auth['username'])
            await page.fill("input[name='password']", auth['password'])
            await page.click("button[type='submit']")
            await page.wait_for_load_state("networkidle")
        
        os.makedirs(output_dir, exist_ok=True)
        results = {}
        
        for component_name, config in components.items():
            try:
                # Navigate to the page
                full_url = f"{base_url}{config['url']}"
                await page.goto(full_url)
                await page.wait_for_load_state("networkidle")
                
                # If there's a trigger to open modal/dialog
                if 'trigger' in config:
                    try:
                        await page.click(config['trigger'])
                        await page.wait_for_selector(config['selector'], state="visible")
                    except Exception as e:
                        print(f"Error triggering {component_name}: {e}")
                        continue
                
                # Wait for the component to be visible
                try:
                    element = await page.wait_for_selector(config['selector'], timeout=5000)
                except Exception:
                    print(f"Component not found: {component_name} at {config['selector']}")
                    continue
                
                # Take screenshot of the component
                output_path = os.path.join(output_dir, f"{component_name}.png")
                await element.screenshot(path=output_path)
                results[component_name] = output_path
                print(f"Screenshot taken: {component_name}")
                
                # If we opened a modal, close it
                if 'trigger' in config:
                    try:
                        await page.press("body", "Escape")
                        await page.wait_for_selector(config['selector'], state="hidden", timeout=1000)
                    except:
                        # Modal might not have closed, but we can continue
                        pass
                
            except Exception as e:
                print(f"Error capturing {component_name}: {e}")
        
        await browser.close()
        return results

def compare_screenshots(before_dir, after_dir, components, threshold=0.05):
    """Compare before and after screenshots and calculate difference percentage"""
    results = {}
    
    for component in components:
        before_path = os.path.join(before_dir, f"{component}.png")
        after_path = os.path.join(after_dir, f"{component}.png")
        
        if not os.path.exists(before_path) or not os.path.exists(after_path):
            results[component] = {
                "error": "Missing screenshot",
                "diff_percent": 100.0
            }
            continue
        
        try:
            # Open images
            before_img = Image.open(before_path)
            after_img = Image.open(after_path)
            
            # Ensure same size for comparison
            if before_img.size != after_img.size:
                # Resize to smallest dimensions
                width = min(before_img.width, after_img.width)
                height = min(before_img.height, after_img.height)
                before_img = before_img.resize((width, height))
                after_img = after_img.resize((width, height))
            
            # Calculate difference
            diff_img = ImageChops.difference(before_img, after_img)
            
            # Save difference image
            diff_dir = os.path.join(os.path.dirname(after_dir), "diff")
            os.makedirs(diff_dir, exist_ok=True)
            diff_path = os.path.join(diff_dir, f"{component}_diff.png")
            diff_img.save(diff_path)
            
            # Calculate difference percentage
            diff_array = np.array(diff_img)
            non_zero = np.count_nonzero(diff_array)
            total_pixels = diff_array.size / 3  # RGB has 3 channels
            diff_percent = (non_zero / total_pixels) * 100
            
            results[component] = {
                "diff_percent": diff_percent,
                "diff_path": diff_path,
                "status": "PASS" if diff_percent <= threshold else "FAIL"
            }
            
        except Exception as e:
            results[component] = {
                "error": str(e),
                "diff_percent": 100.0,
                "status": "ERROR"
            }
    
    return results

async def main():
    parser = argparse.ArgumentParser(description='Visual Regression Test for Respond SPA')
    parser.add_argument('--base-url', default='http://localhost:3000', help='Base URL of the application')
    parser.add_argument('--components', nargs='+', help='Components to test (default: all)')
    parser.add_argument('--before-dir', default='css-audit/baselines/before', help='Directory for before screenshots')
    parser.add_argument('--after-dir', default='css-audit/baselines/after', help='Directory for after screenshots')
    parser.add_argument('--mode', choices=['capture-before', 'capture-after', 'compare'], required=True, 
                        help='Mode: capture before/after screenshots or compare them')
    parser.add_argument('--threshold', type=float, default=0.05, help='Difference threshold percentage (0-100)')
    parser.add_argument('--auth-user', help='Username for authentication')
    parser.add_argument('--auth-pass', help='Password for authentication')
    args = parser.parse_args()
    
    # Determine which components to test
    component_configs = {}
    if args.components:
        for component in args.components:
            if component in COMPONENT_SELECTORS:
                component_configs[component] = COMPONENT_SELECTORS[component]
            else:
                print(f"Unknown component: {component}")
    else:
        component_configs = COMPONENT_SELECTORS
    
    # Auth config if provided
    auth = None
    if args.auth_user and args.auth_pass:
        auth = {
            'username': args.auth_user,
            'password': args.auth_pass
        }
    
    if args.mode == 'capture-before':
        # Take screenshots before changes
        await take_component_screenshots(args.base_url, component_configs, args.before_dir, auth)
        print(f"Before screenshots captured in {args.before_dir}")
        
    elif args.mode == 'capture-after':
        # Take screenshots after changes
        await take_component_screenshots(args.base_url, component_configs, args.after_dir, auth)
        print(f"After screenshots captured in {args.after_dir}")
        
    elif args.mode == 'compare':
        # Compare screenshots
        results = compare_screenshots(args.before_dir, args.after_dir, component_configs.keys(), args.threshold)
        
        # Print results
        print("\nVisual Regression Test Results:")
        print("=" * 80)
        failed = 0
        for component, result in results.items():
            status = result.get('status', 'ERROR')
            diff_percent = result.get('diff_percent', 100.0)
            
            if status == 'FAIL':
                failed += 1
                print(f"❌ {component}: {diff_percent:.2f}% difference (FAILED)")
                if 'diff_path' in result:
                    print(f"   Diff image: {result['diff_path']}")
            elif status == 'ERROR':
                failed += 1
                print(f"⚠️ {component}: ERROR - {result.get('error', 'Unknown error')}")
            else:
                print(f"✅ {component}: {diff_percent:.2f}% difference (PASSED)")
        
        print("=" * 80)
        print(f"Results: {len(results) - failed}/{len(results)} components passed")
        
        # Exit with status code
        if failed > 0:
            print(f"Failed with {failed} component differences above threshold")
            exit(1)

if __name__ == "__main__":
    asyncio.run(main())