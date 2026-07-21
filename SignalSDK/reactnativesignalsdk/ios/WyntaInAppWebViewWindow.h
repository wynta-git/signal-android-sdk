#import <UIKit/UIKit.h>

/**
 * Full-screen in-app browser for a notification CTA's `value` URL, in its own overlay
 * UIWindow. Presented only from WyntaInAppPopupWindow when a tapped CTA has a non-empty
 * value — never referenced by the host app.
 */
@interface WyntaInAppWebViewWindow : NSObject

- (void)presentWithURL:(NSString *)urlString;

@end
