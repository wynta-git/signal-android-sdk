#import <UIKit/UIKit.h>

typedef void (^WyntaInAppInteractionHandler)(NSString *interactionType, NSString * _Nullable ctaLabel);

/**
 * Renders a single in-app notification (image + tappable CTA baked into the image, plus
 * a close button) in its own overlay UIWindow, on top of whatever screen the host app
 * currently has open. No view controller presentation, no host app involvement.
 */
@interface WyntaInAppPopupWindow : NSObject

- (void)presentWithImageURL:(NSString *)imageURLString
                    ctaAction:(NSString *)ctaAction
                     ctaValue:(nullable NSString *)ctaValue
                     ctaLabel:(nullable NSString *)ctaLabel
           interactionHandler:(WyntaInAppInteractionHandler)handler;

@end
