#import "WyntaInAppPopupWindow.h"
#import "WyntaInAppWebViewWindow.h"

@interface WyntaInAppPopupWindow ()
@property (nonatomic, strong) UIWindow *overlayWindow;
@property (nonatomic, strong) WyntaInAppWebViewWindow *webViewWindow;
@property (nonatomic, copy) NSString *ctaAction;
@property (nonatomic, copy) NSString *ctaValue;
@property (nonatomic, copy) NSString *ctaLabel;
@property (nonatomic, copy) WyntaInAppInteractionHandler interactionHandler;
@property (nonatomic, assign) BOOL resolved;
@end

@implementation WyntaInAppPopupWindow

- (void)presentWithImageURL:(NSString *)imageURLString
                    ctaAction:(NSString *)ctaAction
                     ctaValue:(NSString *)ctaValue
                     ctaLabel:(NSString *)ctaLabel
           interactionHandler:(WyntaInAppInteractionHandler)handler {
    self.ctaAction = ctaAction;
    self.ctaValue = ctaValue;
    self.ctaLabel = ctaLabel;
    self.interactionHandler = handler;

    NSURL *url = [NSURL URLWithString:imageURLString];
    if (!url) {
        return;
    }

    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *task = [[NSURLSession sharedSession]
        dataTaskWithURL:url
       completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        UIImage *image = data ? [UIImage imageWithData:data] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (image) {
                [weakSelf showWithImage:image];
            }
        });
    }];
    [task resume];
}

- (void)showWithImage:(UIImage *)image {
    UIWindowScene *scene = nil;
    if (@available(iOS 13.0, *)) {
        for (UIScene *s in [UIApplication sharedApplication].connectedScenes) {
            if ([s isKindOfClass:[UIWindowScene class]] && s.activationState == UISceneActivationStateForegroundActive) {
                scene = (UIWindowScene *)s;
                break;
            }
        }
    }

    UIWindow *window;
    if (@available(iOS 13.0, *)) {
        window = scene ? [[UIWindow alloc] initWithWindowScene:scene]
                        : [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    } else {
        window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    }
    window.frame = [UIScreen mainScreen].bounds;
    window.windowLevel = UIWindowLevelAlert + 1;
    window.backgroundColor = [UIColor clearColor];
    window.rootViewController = [[UIViewController alloc] init];
    self.overlayWindow = window;

    UIView *root = window.rootViewController.view;
    root.backgroundColor = [UIColor colorWithWhite:0 alpha:0.35];
    root.alpha = 0;

    UIBlurEffect *blurEffect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemMaterialDark];
    UIVisualEffectView *blurView = [[UIVisualEffectView alloc] initWithEffect:blurEffect];
    blurView.frame = root.bounds;
    blurView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [root addSubview:blurView];

    CGFloat cardWidth = root.bounds.size.width * 0.85;
    CGFloat cardHeight = cardWidth * (image.size.height / image.size.width);
    CGRect cardFrame = CGRectMake(
        (root.bounds.size.width - cardWidth) / 2.0,
        (root.bounds.size.height - cardHeight) / 2.0,
        cardWidth, cardHeight);

    // The shadow needs masksToBounds off on this container, so the rounded-corner
    // clip happens on the inner clipView instead.
    UIView *card = [[UIView alloc] initWithFrame:cardFrame];
    card.layer.shadowColor = [UIColor blackColor].CGColor;
    card.layer.shadowOpacity = 0.35;
    card.layer.shadowOffset = CGSizeMake(0, 6);
    card.layer.shadowRadius = 16;
    card.transform = CGAffineTransformMakeScale(0.92, 0.92);
    card.alpha = 0;
    [root addSubview:card];

    UIView *clipView = [[UIView alloc] initWithFrame:card.bounds];
    clipView.layer.cornerRadius = 16;
    clipView.layer.masksToBounds = YES;
    clipView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [card addSubview:clipView];

    UIImageView *imageView = [[UIImageView alloc] initWithFrame:clipView.bounds];
    imageView.contentMode = UIViewContentModeScaleAspectFit;
    imageView.userInteractionEnabled = YES;
    imageView.image = image;
    imageView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [clipView addSubview:imageView];

    UITapGestureRecognizer *imageTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleImageTap)];
    [imageView addGestureRecognizer:imageTap];

    // Centered exactly on the card's corner — half in, half out — not clipped since it's
    // a sibling of clipView (not a child of it).
    CGFloat closeSize = 32;
    UIView *closeButton = [[UIView alloc] initWithFrame:CGRectMake(
        cardWidth - closeSize / 2.0,
        -closeSize / 2.0,
        closeSize, closeSize)];
    closeButton.backgroundColor = [UIColor whiteColor];
    closeButton.layer.cornerRadius = closeSize / 2.0;
    closeButton.layer.shadowColor = [UIColor blackColor].CGColor;
    closeButton.layer.shadowOpacity = 0.3;
    closeButton.layer.shadowOffset = CGSizeMake(0, 1);
    closeButton.layer.shadowRadius = 2;

    CGFloat barLength = 12;
    CGFloat barThickness = 1.6;
    UIColor *barColor = [UIColor colorWithRed:0.29 green:0.29 blue:0.29 alpha:1.0];
    UIView *bar1 = [[UIView alloc] initWithFrame:CGRectMake((closeSize - barLength) / 2.0, (closeSize - barThickness) / 2.0, barLength, barThickness)];
    bar1.backgroundColor = barColor;
    bar1.transform = CGAffineTransformMakeRotation(M_PI_4);
    UIView *bar2 = [[UIView alloc] initWithFrame:CGRectMake((closeSize - barLength) / 2.0, (closeSize - barThickness) / 2.0, barLength, barThickness)];
    bar2.backgroundColor = barColor;
    bar2.transform = CGAffineTransformMakeRotation(-M_PI_4);
    [closeButton addSubview:bar1];
    [closeButton addSubview:bar2];

    UITapGestureRecognizer *closeTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleClosePress)];
    [closeButton addGestureRecognizer:closeTap];
    closeButton.userInteractionEnabled = YES;
    [card addSubview:closeButton];

    window.hidden = NO;

    [UIView animateWithDuration:0.18 animations:^{
        root.alpha = 1;
    }];
    [UIView animateWithDuration:0.22 delay:0 usingSpringWithDamping:0.85 initialSpringVelocity:0.3 options:UIViewAnimationOptionCurveEaseOut animations:^{
        card.alpha = 1;
        card.transform = CGAffineTransformIdentity;
    } completion:nil];

    if (self.interactionHandler) {
        self.interactionHandler(@"shown", nil);
    }
}

- (void)handleImageTap {
    if (self.resolved) return;
    self.resolved = YES;

    if (self.interactionHandler) {
        self.interactionHandler(@"clicked", self.ctaLabel);
    }

    // Opens in-app regardless of ctaAction — campaigns have been seen with a real value
    // even when ctaAction is "dismiss", so value alone decides whether to open.
    if (self.ctaValue.length > 0) {
        self.webViewWindow = [[WyntaInAppWebViewWindow alloc] init];
        [self.webViewWindow presentWithURL:self.ctaValue];
    }

    [self dismiss];
}

- (void)handleClosePress {
    if (self.resolved) return;
    self.resolved = YES;

    if (self.interactionHandler) {
        self.interactionHandler(@"dismissed", nil);
    }

    [self dismiss];
}

- (void)dismiss {
    self.overlayWindow.hidden = YES;
    self.overlayWindow = nil;
}

@end
